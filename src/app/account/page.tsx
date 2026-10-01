import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser, getRefereeForUser } from "@/lib/authz";
import {
  CARD_LABELS,
  DISCIPLINARY_SOURCE_LABELS,
  SUSPENSION_REASON_LABELS,
  type CardType,
  type DisciplinarySource,
  type SuspensionReason,
} from "@/lib/enums";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/account");

  const [referee, memberships, captainAssignments] = await Promise.all([
    getRefereeForUser(user),
    prisma.teamMembership.findMany({
      where: { userId: user.appUserId },
      include: {
        season: { select: { id: true, name: true, startsOn: true, endsOn: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
    }),
    prisma.teamCaptain.findMany({
      where: {
        userId: user.appUserId,
        status: "ACTIVE",
        revokedAt: null,
        seasonId: { not: null },
      },
      include: {
        season: { select: { id: true, name: true, startsOn: true, endsOn: true } },
        team: { select: { id: true, name: true } },
      },
    }),
  ]);
  const captainKeys = new Set(
    captainAssignments.map((assignment) => `${assignment.seasonId}:${assignment.teamId}`),
  );
  const historyByTeam = new Map(
    memberships.map((membership) => [
      `${membership.seasonId}:${membership.teamId}`,
      {
        id: membership.id,
        seasonId: membership.seasonId,
        teamId: membership.teamId,
        season: membership.season,
        team: membership.team,
        current: membership.status === "ACTIVE" && !membership.endedAt,
        captain: captainKeys.has(`${membership.seasonId}:${membership.teamId}`),
      },
    ]),
  );
  for (const assignment of captainAssignments) {
    if (!assignment.season) continue;
    const key = `${assignment.seasonId}:${assignment.teamId}`;
    if (!historyByTeam.has(key)) {
      historyByTeam.set(key, {
        id: `captain:${assignment.id}`,
        seasonId: assignment.season.id,
        teamId: assignment.teamId,
        season: assignment.season,
        team: assignment.team,
        current: true,
        captain: true,
      });
    }
  }
  const teamHistory = [...historyByTeam.values()].sort(
    (left, right) =>
      right.season.startsOn.getTime() - left.season.startsOn.getTime() ||
      left.team.name.localeCompare(right.team.name),
  );
  const historyContexts = teamHistory.map(({ seasonId, teamId }) => ({ seasonId, teamId }));
  const discipline = historyContexts.length
    ? await prisma.disciplinaryAction.findMany({
        where: { OR: historyContexts },
        include: {
          match: {
            select: {
              matchweek: true,
              homeTeam: { select: { shortName: true } },
              awayTeam: { select: { shortName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const disciplineByMembership = new Map<string, typeof discipline>();
  for (const action of discipline) {
    const key = `${action.seasonId}:${action.teamId}`;
    const records = disciplineByMembership.get(key);
    if (records) records.push(action);
    else disciplineByMembership.set(key, [action]);
  }
  const seasons = [
    ...new Map(teamHistory.map((entry) => [entry.seasonId, entry.season])).values(),
  ];
  const visibleRoles = user.roles.filter((role) => role !== "viewer" && role !== "public");

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Your account"
        description="Your identity, league access, and playing history."
        actions={<ButtonLink href="/roster">Roster requests</ButtonLink>}
      />

      {user.isDevBypass ? (
        <Alert tone="warning" title="Development session">
          You are signed in through the dev-only bypass. This identity uses the same database role
          assignments and team contexts as a Microsoft sign-in.
        </Alert>
      ) : null}

      {user.roleError ? (
        <div className="mt-4">
          <Alert tone="warning" title="Group membership could not be verified">
            {user.roleError} You have been given read-only access until the database responds.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-6 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Name</dt>
            <dd className="mt-1">{user.name ?? "\u2014"}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Email</dt>
            <dd className="mt-1 font-mono text-sm break-all">{user.email ?? "\u2014"}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {visibleRoles.length ? (
                visibleRoles.map((role) => (
                  <Badge
                    key={role}
                    tone={role === "admin" ? "accent" : role === "referee" ? "brand" : "neutral"}
                  >
                    {role}
                  </Badge>
                ))
              ) : (
                <span className="text-muted text-sm">Standard account</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Referee record</dt>
            <dd className="mt-1 text-sm">
              {referee ? (
                <>
                  {referee.name}
                  {referee.active ? null : <span className="text-danger"> (inactive)</span>}
                </>
              ) : (
                <span className="text-muted">None linked</span>
              )}
            </dd>
          </div>
        </dl>
      </Card>

      <section className="mt-8" aria-labelledby="season-overview">
        <h2 id="season-overview" className="mb-3 text-xl font-semibold">
          Seasons played
        </h2>
        {seasons.length ? (
          <div className="space-y-3">
            {seasons.map((season) => {
              const seasonMemberships = teamHistory.filter(
                (entry) => entry.seasonId === season.id,
              );
              const seasonDiscipline = seasonMemberships.flatMap(
                (membership) =>
                  disciplineByMembership.get(`${membership.seasonId}:${membership.teamId}`) ?? [],
              );
              return (
                <Card as="details" key={season.id} className="group overflow-hidden">
                  <summary className="hover:bg-surface-muted cursor-pointer list-none p-5 transition">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{season.name}</h3>
                        <p className="text-muted mt-1 text-sm">
                          {seasonMemberships.map((membership) => membership.team.name).join(", ")}
                        </p>
                      </div>
                      <Badge tone={seasonDiscipline.length ? "warning" : "neutral"}>
                        {seasonDiscipline.length} discipline{" "}
                        {seasonDiscipline.length === 1 ? "record" : "records"}
                      </Badge>
                    </div>
                  </summary>
                  <div className="border-subtle space-y-5 border-t p-5">
                    {seasonMemberships.map((membership) => {
                      const records =
                        disciplineByMembership.get(`${membership.seasonId}:${membership.teamId}`) ??
                        [];
                      return (
                        <section key={membership.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-semibold">{membership.team.name}</h4>
                            <div className="flex flex-wrap gap-2">
                              {membership.captain ? <Badge tone="brand">Captain</Badge> : null}
                              <Badge tone={membership.current ? "success" : "neutral"}>
                                {membership.current ? "Current team" : "Former roster"}
                              </Badge>
                            </div>
                          </div>
                          {records.length ? (
                            <ul className="mt-3 space-y-2">
                              {records.map((action) => (
                                <li
                                  key={action.id}
                                  className="bg-surface-muted rounded-lg p-3 text-sm"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">{action.playerName}</span>
                                    <Badge tone={action.type === "RED" ? "danger" : "warning"}>
                                      {CARD_LABELS[action.type as CardType] ?? action.type}
                                    </Badge>
                                    {action.suspensionReason ? (
                                      <Badge tone="danger">
                                        {SUSPENSION_REASON_LABELS[
                                          action.suspensionReason as SuspensionReason
                                        ] ?? action.suspensionReason}
                                        {action.gamesSuspended
                                          ? ` · ${action.gamesSuspended} game${action.gamesSuspended === 1 ? "" : "s"}`
                                          : ""}
                                      </Badge>
                                    ) : null}
                                    <span className="text-muted text-xs">
                                      {DISCIPLINARY_SOURCE_LABELS[
                                        action.issuedBy as DisciplinarySource
                                      ] ?? action.issuedBy}
                                      {action.match
                                        ? ` · MW ${action.match.matchweek} ${action.match.homeTeam.shortName} v ${action.match.awayTeam.shortName}`
                                        : ""}
                                    </span>
                                  </div>
                                  <p className="mt-2">
                                    {action.note ??
                                      (action.suspensionReason
                                        ? "No additional reason was recorded."
                                        : "No suspension or additional action recorded.")}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-muted mt-2 text-sm">
                              No disciplinary actions recorded for this team and season.
                            </p>
                          )}
                        </section>
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
              title="No team history yet"
              hint="Season and team history appears after you join a roster."
            />
          </Card>
        )}
        {teamHistory.length ? (
          <p className="text-muted mt-3 text-xs">
            Discipline includes records filed for each team during that season.
          </p>
        ) : null}
      </section>

      <form action={doSignOut} className="mt-6">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
