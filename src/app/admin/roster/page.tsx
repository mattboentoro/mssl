import type { Metadata } from "next";
import Link from "next/link";

import { MatchDisclosureStack } from "@/components/match-display";
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
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Roster & Captain administration" };
export const dynamic = "force-dynamic";

type RosterState = "attention" | "all" | "captainless" | "ready";
type PlayerState = "all" | "empty" | "has-players";

function rosterState(value: string | undefined): RosterState {
  return value === "attention" || value === "captainless" || value === "ready" ? value : "all";
}

function playerState(value: string | undefined): PlayerState {
  return value === "empty" || value === "has-players" ? value : "all";
}

export default async function AdminRosterPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    season?: string;
    team?: string;
    state?: string;
    players?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
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
    const activeCaptains = captains.filter(
      (captain) =>
        captain.seasonId === selectedSeason.id &&
        captain.status === "ACTIVE" &&
        captain.user?.status === "ACTIVE",
    );
    return {
      entry,
      captains,
      activeCaptains,
      memberships: entry.team.memberships,
      needsAttention: activeCaptains.length === 0,
    };
  });
  const visible = summaries
    .filter(
      ({ entry }) =>
        !query ||
        `${entry.team.name} ${entry.team.shortName}`.toLowerCase().includes(query),
    )
    .filter(({ entry }) => !selectedTeamId || entry.teamId === selectedTeamId)
    .filter(({ activeCaptains, needsAttention }) => {
      if (selectedState === "captainless") return activeCaptains.length === 0;
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
        description="A read-only overview of registered players, Captain assignments, and team contacts. The active season and all teams are shown by default."
      />
      <Card className="mb-5 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Field label="Search teams" htmlFor="roster-search">
              <input
                id="roster-search"
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="Team name"
                className={inputClass}
              />
            </Field>
          </div>
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
              <option value="ready">Has a Captain</option>
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
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-6">
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
          const activeCaptainUserIds = new Set(
            activeCaptains.flatMap(({ userId }) => (userId ? [userId] : [])),
          );
          return (
            <MatchDisclosureStack key={entry.id}>
              <Card
                as="details"
                className={`group overflow-hidden ${activeCaptains.length ? "" : "border-danger"}`}
              >
                <summary className="hover:bg-surface-muted cursor-pointer list-none px-4 py-3 transition">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{entry.team.name}</h2>
                      <p className="text-muted text-xs">{selectedSeason.name}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!activeCaptains.length ? (
                        <Badge tone="danger">Captainless</Badge>
                      ) : (
                        <Badge tone="brand">
                          {activeCaptains.length} Captain{activeCaptains.length === 1 ? "" : "s"}
                        </Badge>
                      )}
                      <Badge tone={memberships.length ? "neutral" : "warning"}>
                        {memberships.length
                          ? `${memberships.length} active player${memberships.length === 1 ? "" : "s"}`
                          : "No active players"}
                      </Badge>
                      <Link
                        href={`/captain/roster?seasonId=${entry.seasonId}&teamId=${entry.teamId}`}
                        className={buttonClass("secondary", "px-2 py-1 text-xs")}
                      >
                        Manage roster
                      </Link>
                    </div>
                  </div>
                </summary>
                <div className="border-subtle grid gap-5 border-t p-4 xl:grid-cols-2">
                  <div>
                  <h3 className="text-sm font-semibold">Active players</h3>
                  {memberships.length ? (
                    <ul className="mt-2 grid gap-2">
                      {memberships.map((membership) => (
                        <li
                          key={membership.id}
                          className="bg-surface-muted border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{membership.user.displayName}</p>
                            <p className="text-muted truncate text-sm">{membership.user.email}</p>
                          </div>
                          <Badge
                            tone={activeCaptainUserIds.has(membership.userId) ? "brand" : "neutral"}
                          >
                            {activeCaptainUserIds.has(membership.userId) ? "Captain" : "Player"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted mt-2 text-sm">No active players in this season.</p>
                  )}
                  </div>
                  <div>
                  <h3 className="text-sm font-semibold">Registered Captains and team contacts</h3>
                  {captains.length ? (
                    <ul className="mt-2 grid gap-2">
                      {captains.map((captain) => {
                        const isActiveCaptain = activeCaptains.some(({ id }) => id === captain.id);
                        return (
                          <li
                            key={captain.id}
                            className="bg-surface-muted border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {captain.user?.displayName ?? captain.name}
                              </p>
                              <p className="text-muted truncate text-sm">
                                {captain.user?.email ?? captain.email ?? "No account e-mail"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={isActiveCaptain ? "brand" : "warning"}>
                                {isActiveCaptain
                                  ? "Captain"
                                  : captain.seasonId
                                    ? "Pending Captain"
                                    : "Team contact"}
                              </Badge>
                              <Badge tone={captain.user?.entraObjectId ? "success" : "neutral"}>
                                {captain.user?.entraObjectId
                                  ? "Entra linked"
                                  : captain.user?.status === "ACTIVE"
                                    ? "Account active"
                                    : "Awaiting sign-in"}
                              </Badge>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-muted mt-2 text-sm">
                      No Captain assignment or team contact is registered.
                    </p>
                  )}
                  </div>
                </div>
              </Card>
            </MatchDisclosureStack>
          );
        })}
        {!visible.length ? (
          <Card className="p-6">
            <EmptyState
              title="No rosters match these filters"
              hint="Change the search, Captain status, or player filters to show more teams."
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
