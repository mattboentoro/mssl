import type { Metadata } from "next";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  buttonClass,
  inputClass,
} from "@/components/ui";
import { ASSIGNABLE_ROLES } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

import { mutateRoleAction } from "./actions";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

const DIRECTORY_ROLES = ["player", "captain", "referee", "admin"] as const;
type DirectoryRole = (typeof DIRECTORY_ROLES)[number];
type DirectorySort = "name-asc" | "name-desc" | "roles-asc" | "roles-desc";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    teamId?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const role = DIRECTORY_ROLES.includes(params.role as DirectoryRole)
    ? (params.role as DirectoryRole)
    : "";
  const status = params.status === "active" || params.status === "inactive" ? params.status : "";
  const teamId = params.teamId ?? "";
  const sort: DirectorySort = [
    "name-asc",
    "name-desc",
    "roles-asc",
    "roles-desc",
  ].includes(params.sort ?? "")
    ? (params.sort as DirectorySort)
    : "name-asc";

  const users = await prisma.appUser.findMany({
    include: {
      rolesAssigned: { where: { revokedAt: null }, orderBy: { role: "asc" } },
      memberships: {
        where: { status: "ACTIVE", endedAt: null },
        include: {
          team: { select: { id: true, name: true } },
          season: { select: { name: true } },
        },
      },
      captainAssignments: {
        where: { status: "ACTIVE", revokedAt: null, seasonId: { not: null } },
        include: {
          team: { select: { id: true, name: true } },
          season: { select: { name: true } },
        },
      },
    },
    orderBy: [{ displayName: "asc" }, { normalizedEmail: "asc" }],
  });
  const directory = users.map((user) => {
    const roles = DIRECTORY_ROLES.filter(
      (candidate) =>
        (candidate === "player" && user.memberships.length > 0) ||
        (candidate === "captain" && user.captainAssignments.length > 0) ||
        (candidate === "referee" &&
          user.rolesAssigned.some((assignment) => assignment.role === "REFEREE")) ||
        (candidate === "admin" &&
          user.rolesAssigned.some((assignment) => assignment.role === "ADMIN")),
    );
    const teamIds = new Set([
      ...user.memberships.map((membership) => membership.teamId),
      ...user.captainAssignments.map((assignment) => assignment.teamId),
    ]);
    return { user, roles, teamIds, roleSortKey: roles.join(" ") };
  });
  const teams = [
    ...new Map(
      directory.flatMap(({ user }) => [
        ...user.memberships.map((membership) => [membership.team.id, membership.team.name] as const),
        ...user.captainAssignments.map(
          (assignment) => [assignment.team.id, assignment.team.name] as const,
        ),
      ]),
    ),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleUsers = directory
    .filter(({ user, roles, teamIds }) => {
      const searchText = `${user.displayName} ${user.email} ${roles.join(" ")}`.toLowerCase();
      return (
        (!query || searchText.includes(query)) &&
        (!role || roles.includes(role)) &&
        (!status || (status === "active" ? user.status === "ACTIVE" : user.status !== "ACTIVE")) &&
        (!teamId || teamIds.has(teamId))
      );
    })
    .sort((left, right) => {
      const direction = sort.endsWith("-desc") ? -1 : 1;
      const comparison = sort.startsWith("roles")
        ? left.roleSortKey.localeCompare(right.roleSortKey)
        : left.user.displayName.localeCompare(right.user.displayName);
      return (
        comparison * direction ||
        left.user.displayName.localeCompare(right.user.displayName) ||
        left.user.normalizedEmail.localeCompare(right.user.normalizedEmail)
      );
    });

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Roles are cumulative, non-hierarchical, and stored in the application database."
      />
      <Card className="mb-5 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
          <div className="xl:col-span-2">
            <Field label="Search" htmlFor="user-search">
              <input
                className={inputClass}
                defaultValue={params.q ?? ""}
                id="user-search"
                name="q"
                placeholder="Name, email, or role"
                type="search"
              />
            </Field>
          </div>
          <Field label="Role" htmlFor="role-filter">
            <select className={inputClass} defaultValue={role} id="role-filter" name="role">
              <option value="">All roles</option>
              {DIRECTORY_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status-filter">
            <select className={inputClass} defaultValue={status} id="status-filter" name="status">
              <option value="">All statuses</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </Field>
          <Field label="Team" htmlFor="team-filter">
            <select className={inputClass} defaultValue={teamId} id="team-filter" name="teamId">
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort" htmlFor="user-sort">
            <select className={inputClass} defaultValue={sort} id="user-sort" name="sort">
              <option value="name-asc">name asc</option>
              <option value="name-desc">name desc</option>
              <option value="roles-asc">roles asc</option>
              <option value="roles-desc">roles desc</option>
            </select>
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6">
            <button className={buttonClass("primary")} type="submit">
              Apply
            </button>
            <ButtonLink href="/admin/users" variant="secondary">
              Reset
            </ButtonLink>
            <span className="text-muted self-center text-sm">
              {visibleUsers.length} of {users.length} users
            </span>
          </div>
        </form>
      </Card>
      {visibleUsers.length ? (
        <div className="space-y-3">
          {visibleUsers.map(({ user }) => {
            const assigned = new Set(user.rolesAssigned.map((item) => item.role));
            return (
              <Card key={user.id} className="p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{user.displayName}</h2>
                      <Badge tone={user.status === "ACTIVE" ? "brand" : "warning"}>
                        {user.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-muted text-xs">{user.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      {user.rolesAssigned
                        .filter(({ role }) => role === "REFEREE" || role === "ADMIN")
                        .map(({ id, role }) => (
                          <Badge key={id} tone={role === "ADMIN" ? "accent" : "brand"}>
                            {role.toLowerCase()}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {ASSIGNABLE_ROLES.map((role) => {
                      const hasRole = assigned.has(role);
                      return (
                        <ActionForm
                          action={mutateRoleAction}
                          key={role}
                          className="inline-block"
                          showSuccess={false}
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="role" value={role} />
                          <input
                            type="hidden"
                            name="operation"
                            value={hasRole ? "revoke" : "assign"}
                          />
                          <SubmitButton
                            variant={hasRole ? "danger" : "secondary"}
                            className="px-2 py-1 text-xs"
                            confirm={
                              hasRole
                                ? `Remove only the ${role} role from ${user.displayName}? Their other roles and team assignments will remain.`
                                : `Add the ${role} role to ${user.displayName} without changing their other roles?`
                            }
                          >
                            {hasRole
                              ? `Remove ${role.toLowerCase()}`
                              : `Add ${role.toLowerCase()}`}
                          </SubmitButton>
                        </ActionForm>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            title={users.length ? "No users match these filters" : "No application users"}
            hint={
              users.length
                ? "Clear or adjust the directory filters."
                : "Users appear after their first sign-in or when a pending invitation is created."
            }
          />
          {users.length ? (
            <div className="mt-4 text-center">
              <ButtonLink href="/admin/users" variant="secondary">
                Reset filters
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
