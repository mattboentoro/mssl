import type { Metadata } from "next";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ASSIGNABLE_ROLES } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

import { mutateRoleAction } from "./actions";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.appUser.findMany({
    include: {
      rolesAssigned: { where: { revokedAt: null }, orderBy: { role: "asc" } },
      memberships: {
        where: { status: "ACTIVE", endedAt: null },
        include: { team: { select: { name: true } }, season: { select: { name: true } } },
      },
      captainAssignments: {
        where: { status: "ACTIVE", revokedAt: null, seasonId: { not: null } },
        include: { team: { select: { name: true } }, season: { select: { name: true } } },
      },
    },
    orderBy: [{ displayName: "asc" }, { normalizedEmail: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Roles are cumulative, non-hierarchical, and stored in the application database."
      />
      {users.length ? (
        <div className="space-y-3">
          {users.map((user) => {
            const assigned = new Set(user.rolesAssigned.map((item) => item.role));
            return (
              <Card key={user.id} className="p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{user.displayName}</h2>
                    <p className="text-muted text-sm">{user.email}</p>
                  </div>
                  <Badge tone={user.status === "ACTIVE" ? "brand" : "warning"}>
                    {user.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>viewer</Badge>
                  {user.memberships.map((membership) => (
                    <Badge key={membership.id}>
                      player · {membership.team.name} · {membership.season.name}
                    </Badge>
                  ))}
                  {user.captainAssignments.map((captain) => (
                    <Badge key={captain.id} tone="brand">
                      captain · {captain.team.name} · {captain.season?.name ?? "all seasons"}
                    </Badge>
                  ))}
                  {ASSIGNABLE_ROLES.map((role) => {
                    const hasRole = assigned.has(role);
                    return (
                      <ActionForm action={mutateRoleAction} key={role} className="inline-block">
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="role" value={role} />
                        <input
                          type="hidden"
                          name="operation"
                          value={hasRole ? "revoke" : "assign"}
                        />
                        <SubmitButton
                          variant={hasRole ? "danger" : "secondary"}
                          confirm={
                            hasRole
                              ? `Remove only the ${role} role from ${user.displayName}? Their other roles and team assignments will remain.`
                              : `Add the ${role} role to ${user.displayName} without changing their other roles?`
                          }
                        >
                          {hasRole ? `Remove ${role}` : `Add ${role}`}
                        </SubmitButton>
                      </ActionForm>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No application users"
            hint="Users appear after their first sign-in or when a pending invitation is created."
          />
        </Card>
      )}
    </div>
  );
}
