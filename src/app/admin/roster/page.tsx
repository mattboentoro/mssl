import type { Metadata } from "next";
import Link from "next/link";

import { relinkCaptainAction } from "@/app/admin/roster/actions";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import {
  Alert,
  Badge,
  buttonClass,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { isActiveCaptainForSeason } from "@/lib/admin-roster";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Roster & Captain administration" };
export const dynamic = "force-dynamic";

type RosterState = "attention" | "all" | "captainless" | "unclaimed" | "ready";
type PlayerState = "all" | "empty" | "has-players";

function rosterState(value: string | undefined): RosterState {
  return value === "all" || value === "captainless" || value === "unclaimed" || value === "ready"
    ? value
    : "attention";
}

function playerState(value: string | undefined): PlayerState {
  return value === "empty" || value === "has-players" ? value : "all";
}

export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    season?: string;
    team?: string;
    state?: string;
    players?: string;
  }>;
}) {
  const params = await searchParams;
  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: "desc" }, { startsOn: "desc" }],
    select: { id: true, name: true, isActive: true },
  });
  const selectedSeason =
    seasons.find((season) => season.id === params.season) ??
    seasons.find((season) => season.isActive) ??
    seasons[0];
  const selectedState = rosterState(params.state);
  const selectedPlayerState = playerState(params.players);

  if (!selectedSeason) {
    return (
      <div>
        <PageHeader
          title="Roster & Captain administration"
          description="Review team rosters and Captain account links."
        />
        <Card className="p-6">
          <EmptyState title="No seasons exist" hint="Create a season in League setup first." />
        </Card>
      </div>
    );
  }

  const teams = await prisma.seasonTeam.findMany({
    where: { seasonId: selectedSeason.id },
    include: {
      team: {
        include: {
          memberships: {
            where: { seasonId: selectedSeason.id, status: "ACTIVE", endedAt: null },
            include: { user: { select: { displayName: true, email: true, status: true } } },
          },
          captains: {
            where: {
              revokedAt: null,
              OR: [{ seasonId: selectedSeason.id }, { seasonId: null }],
            },
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
    orderBy: { team: { name: "asc" } },
  });
  const teamOptions = teams.map((entry) => ({ id: entry.teamId, name: entry.team.name }));
  const selectedTeamId = teamOptions.some((team) => team.id === params.team) ? params.team : "";
  const summaries = teams.map((entry) => {
    const captains = entry.team.captains;
    const activeCaptains = captains.filter((captain) =>
      isActiveCaptainForSeason(captain, entry.seasonId),
    );
    const hasUnclaimedIdentity = captains.some(
      (captain) => captain.seasonId === null || !captain.user?.entraObjectId,
    );
    return {
      entry,
      captains,
      activeCaptains,
      memberships: entry.team.memberships,
      hasUnclaimedIdentity,
      needsAttention: activeCaptains.length === 0 || hasUnclaimedIdentity,
    };
  });
  const visible = summaries
    .filter(({ entry }) => !selectedTeamId || entry.teamId === selectedTeamId)
    .filter(({ activeCaptains, hasUnclaimedIdentity, needsAttention }) => {
      if (selectedState === "captainless") return activeCaptains.length === 0;
      if (selectedState === "unclaimed") return hasUnclaimedIdentity;
      if (selectedState === "ready") return !needsAttention;
      if (selectedState === "attention") return needsAttention;
      return true;
    })
    .filter(({ memberships }) => {
      if (selectedPlayerState === "empty") return memberships.length === 0;
      if (selectedPlayerState === "has-players") return memberships.length > 0;
      return true;
    })
    .sort(
      (left, right) =>
        Number(right.needsAttention) - Number(left.needsAttention) ||
        left.entry.team.name.localeCompare(right.entry.team.name),
    );

  return (
    <div>
      <PageHeader
        title="Roster & Captain administration"
        description="The active season and teams needing attention are shown by default. Expand the filters to review healthy or historical rosters."
      />
      <Card className="mb-5 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Season" htmlFor="roster-season">
            <select
              id="roster-season"
              name="season"
              defaultValue={selectedSeason.id}
              className={inputClass}
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                  {season.isActive ? " (active)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team" htmlFor="roster-team">
            <select
              id="roster-team"
              name="team"
              defaultValue={selectedTeamId}
              className={inputClass}
            >
              <option value="">All teams</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Captain status" htmlFor="roster-state">
            <select
              id="roster-state"
              name="state"
              defaultValue={selectedState}
              className={inputClass}
            >
              <option value="attention">Needs attention</option>
              <option value="all">All Captain statuses</option>
              <option value="captainless">Captainless</option>
              <option value="unclaimed">Unclaimed identities</option>
              <option value="ready">Captain access ready</option>
            </select>
          </Field>
          <Field label="Player roster" htmlFor="roster-players">
            <select
              id="roster-players"
              name="players"
              defaultValue={selectedPlayerState}
              className={inputClass}
            >
              <option value="all">Any roster size</option>
              <option value="empty">No active players</option>
              <option value="has-players">Has active players</option>
            </select>
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
            <button type="submit" className={buttonClass("primary")}>
              Apply filters
            </button>
            <ButtonLink href="/admin/roster" variant="secondary">
              Reset to active season
            </ButtonLink>
          </div>
        </form>
      </Card>
      <Alert
        tone={selectedSeason.isActive ? "success" : "info"}
        title={`${selectedSeason.name}${selectedSeason.isActive ? " · Active season" : ""}`}
        className="mb-4"
      >
        Showing {visible.length} of {summaries.length} team
        {summaries.length === 1 ? "" : "s"}. Normal players still join only through accepted
        requests or invitations.
      </Alert>
      <div className="grid gap-4">
        {visible.map(({ entry, captains, activeCaptains, memberships }) => {
          return (
            <Card key={entry.id} className={`p-5 ${activeCaptains.length ? "" : "border-danger"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{entry.team.name}</h2>
                  <p className="text-muted text-sm">{selectedSeason.name}</p>
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
        {!visible.length ? (
          <Card className="p-6">
            <EmptyState
              title="No rosters match these filters"
              hint="Change the Captain or player filters to show more teams."
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
