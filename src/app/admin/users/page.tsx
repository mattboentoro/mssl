import type { Metadata } from "next";

import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { ASSIGNABLE_ROLES } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

import { mutateRoleAction } from "./actions";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.appUser.findMany({
    include: { rolesAssigned: { where: { revokedAt: null }, orderBy: { role: "asc" } } },
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
                  {ASSIGNABLE_ROLES.map((role) => {
                    const hasRole = assigned.has(role);
                    return (
                      <form action={mutateRoleAction} key={role}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="role" value={role} />
                        <input
                          type="hidden"
                          name="operation"
                          value={hasRole ? "revoke" : "assign"}
                        />
                        <Button type="submit" variant={hasRole ? "secondary" : "ghost"}>
                          {hasRole ? `Remove ${role}` : `Add ${role}`}
                        </Button>
                      </form>
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
