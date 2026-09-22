import type { Metadata } from "next";
import Link from "next/link";

import { relinkCaptainAction } from "@/app/admin/roster/actions";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Badge, Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { isActiveCaptainForSeason } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Roster & Captain administration" };
export const dynamic = "force-dynamic";

export default async function AdminRosterPage() {
  const teams = await prisma.seasonTeam.findMany({
    include: {
      season: true,
      team: {
        include: {
          memberships: {
            where: { status: "ACTIVE", endedAt: null },
            include: { user: { select: { displayName: true, email: true, status: true } } },
          },
          captains: {
            where: { revokedAt: null },
            include: {
              user: {
                select: { displayName: true, email: true, status: true, entraObjectId: true },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
    orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
  });
  const ordered = [...teams].sort((left, right) => {
    const leftCount = left.team.captains.filter(
      (captain) => captain.seasonId === left.seasonId && captain.status === "ACTIVE",
    ).length;
    const rightCount = right.team.captains.filter(
      (captain) => captain.seasonId === right.seasonId && captain.status === "ACTIVE",
    ).length;
    return leftCount - rightCount;
  });

  return (
    <div>
      <PageHeader
        title="Roster & Captain administration"
        description="Captainless teams and unclaimed legacy Captain identities are shown first. Normal players still join only through accepted requests or invitations."
      />
      <div className="grid gap-4">
        {ordered.map((entry) => {
          const captains = entry.team.captains.filter(
            (captain) => captain.seasonId === entry.seasonId || captain.seasonId === null,
          );
          const activeCaptains = captains.filter((captain) =>
            isActiveCaptainForSeason(captain, entry.seasonId),
          );
          const memberships = entry.team.memberships.filter(
            (membership) => membership.seasonId === entry.seasonId,
          );
          return (
            <Card key={entry.id} className={`p-5 ${activeCaptains.length ? "" : "border-danger"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{entry.team.name}</h2>
                  <p className="text-muted text-sm">{entry.season.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!activeCaptains.length ? <Badge tone="danger">Captainless</Badge> : null}
                  <Badge>{memberships.length} active player(s)</Badge>
                  <Link
                    href={`/captain/roster?seasonId=${entry.seasonId}&teamId=${entry.teamId}`}
                    className="text-brand text-sm hover:underline"
                  >
                    Manage roster
                  </Link>
                </div>
              </div>
              {captains.length ? (
                <div className="mt-4 grid gap-3">
                  {captains.map((captain) => (
                    <div key={captain.id} className="border-subtle rounded-lg border p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <strong>{captain.user?.displayName ?? captain.name}</strong>
                        <Badge tone={captain.status === "ACTIVE" ? "brand" : "warning"}>
                          {captain.seasonId ? captain.status.toLowerCase() : "legacy · unbound"}
                        </Badge>
                        <span className="text-muted text-xs">
                          {captain.user?.entraObjectId ? "Entra linked" : "awaiting account claim"}
                        </span>
                      </div>
                      <ActionForm
                        action={relinkCaptainAction}
                        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <input type="hidden" name="captainId" value={captain.id} />
                        <input type="hidden" name="seasonId" value={entry.seasonId} />
                        <input
                          type="hidden"
                          name="expectedUpdatedAt"
                          value={captain.updatedAt.toISOString()}
                        />
                        <Field label="Captain name" htmlFor={`${captain.id}-name`}>
                          <input
                            id={`${captain.id}-name`}
                            name="name"
                            defaultValue={captain.name}
                            required
                            maxLength={120}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Identity e-mail" htmlFor={`${captain.id}-email`}>
                          <input
                            id={`${captain.id}-email`}
                            name="email"
                            type="email"
                            defaultValue={captain.email ?? ""}
                            required
                            className={inputClass}
                          />
                        </Field>
                        <div className="self-end">
                          <SubmitButton
                            variant="secondary"
                            confirm="Relink this Captain record to the account matching the entered e-mail? This changes Captain access but does not add anyone to the player roster."
                          >
                            Save identity
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title="This team is Captainless"
                    hint="Use Manage roster to promote an active player, or League setup to add a pending Captain contact."
                  />
                </div>
              )}
            </Card>
          );
        })}
        {!ordered.length ? (
          <Card className="p-6">
            <EmptyState title="No team-season rosters exist" />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
