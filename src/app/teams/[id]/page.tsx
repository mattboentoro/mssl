import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CalendarViewToggle, FixtureCalendar, parseView } from "@/components/fixture-calendar";
import { MatchList } from "@/components/match-display";
import { TeamLogo } from "@/components/team-logo";
import { BackLink, buttonClass, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import { CARD_LABELS, type CardType } from "@/lib/enums";
import { formatDate, parseMonthValue, shiftMonth } from "@/lib/dates";
import { zonedToUtc } from "@/lib/timezone";
import { kitColorName, resolveKit } from "@/lib/kits";
import { prisma } from "@/lib/prisma";
import {
  getActiveSeason,
  getDisciplinaryRecords,
  getStandingsForSeason,
  getTeamDetail,
  getTeamMatches,
  splitTeamMatches,
} from "@/lib/queries";
import { isRescheduleCutoffReached, OPEN_RESCHEDULE_STATUSES } from "@/lib/reschedules";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeamDetail(id);
  return { title: team ? team.name : "Team not found" };
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const { id } = await params;
  const { view: viewParam, month: monthParam } = await searchParams;
  const team = await getTeamDetail(id);
  if (!team) notFound();
  // Referee appointments stay behind sign-in.

  // A club belongs to the league, not to a season, so its form and discipline
  // are shown for whichever season is currently running.
  const [season, currentUser] = await Promise.all([getActiveSeason(), getCurrentUser()]);
  const captainContext = currentUser?.teamContexts.find(
    (context) =>
      context.role === "captain" &&
      context.teamId === team.id &&
      (!season || context.seasonId === season.id),
  );

  const [matches, standings, discipline] = await Promise.all([
    getTeamMatches(team.id),
    season ? getStandingsForSeason(season.id) : Promise.resolve([]),
    season ? getDisciplinaryRecords(season.id) : Promise.resolve([]),
  ]);

  const row = standings
    .find((d) => d.divisionId === team.division.id)
    ?.rows.find((r) => r.teamId === team.id);

  const { played, upcoming } = splitTeamMatches(matches);
  const teamCards = discipline.filter((d) => d.teamId === team.id);
  const now = new Date();
  const [openReschedules, availableSlot] = captainContext
    ? await Promise.all([
        prisma.rescheduleRequest.findMany({
          where: {
            matchId: { in: upcoming.map((match) => match.id) },
            status: { in: [...OPEN_RESCHEDULE_STATUSES] },
          },
          select: { id: true, matchId: true },
        }),
        prisma.rescheduleSlot.findFirst({
          where: {
            status: "AVAILABLE",
            kickoffAt: { gt: now },
            requests: { none: { activeSlotKey: { not: null } } },
          },
          select: { id: true },
        }),
      ])
    : [[], null];
  const openRescheduleByMatch = new Map(
    openReschedules.map((request) => [request.matchId, request.id]),
  );
  const rescheduleActions = captainContext
    ? Object.fromEntries(
        upcoming.flatMap((match) => {
          if (
            match.seasonId !== captainContext.seasonId ||
            !["SCHEDULED", "ASSIGNED"].includes(match.status) ||
            match.report
          ) {
            return [];
          }
          const openRequestId = openRescheduleByMatch.get(match.id);
          if (openRequestId) {
            return [
              [
                match.id,
                <ButtonLink
                  key={match.id}
                  href={`/captain/reschedules#request-${encodeURIComponent(openRequestId)}`}
                  variant="secondary"
                >
                  View request
                </ButtonLink>,
              ],
            ];
          }
          if (isRescheduleCutoffReached(match.kickoffAt, now)) {
            return [
              [
                match.id,
                <span
                  key={match.id}
                  aria-disabled="true"
                  title="Rescheduling closes 48 hours before kickoff."
                  className={buttonClass("secondary")}
                >
                  Reschedule locked
                </span>,
              ],
            ];
          }
          if (!availableSlot) {
            return [
              [
                match.id,
                <span
                  key={match.id}
                  aria-disabled="true"
                  title="No league-provided reschedule slots are available."
                  className={buttonClass("secondary")}
                >
                  No slots
                </span>,
              ],
            ];
          }
          return [
            [
              match.id,
              <ButtonLink
                key={match.id}
                href={`/captain/reschedules?match=${encodeURIComponent(match.id)}&team=${encodeURIComponent(team.id)}`}
                variant="secondary"
              >
                Reschedule
              </ButtonLink>,
            ],
          ];
        }),
      )
    : undefined;

  const view = parseView(viewParam);
  // The calendar shows every fixture in the month, played or not, because a
  // month grid is read as "what happened / what is coming" rather than as a
  // filtered list. Month boundaries are league-time midnights.
  const monthValue = parseMonthValue(monthParam);
  const nextMonth = shiftMonth(monthValue.year, monthValue.month, 1);
  const monthStart = zonedToUtc(monthValue.year, monthValue.month, 1).getTime();
  const monthEnd = zonedToUtc(nextMonth.year, nextMonth.month, 1).getTime();
  const calendarMatches = matches.filter(
    (m) => m.kickoffAt.getTime() >= monthStart && m.kickoffAt.getTime() < monthEnd,
  );

  const summary: { label: string; value: string }[] = row
    ? [
        { label: "Position", value: `#${row.rank}` },
        { label: "Played", value: String(row.played) },
        { label: "Record", value: `${row.won}W ${row.drawn}D ${row.lost}L` },
        { label: "Goals", value: `${row.goalsFor} : ${row.goalsAgainst}` },
        {
          label: "Goal difference",
          value: row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference),
        },
        { label: "Points", value: String(row.points) },
      ]
    : [];

  return (
    <div>
      <div className="mb-4">
        <BackLink href="/teams">All teams</BackLink>
      </div>
      <div className="flex items-start gap-4">
        <TeamLogo
          teamId={team.id}
          name={team.name}
          hasLogo={Boolean(team.logoBlobName)}
          size={72}
        />
        <PageHeader
          eyebrow={team.division.name}
          title={team.name}
          description={team.shortName ? `Also known as ${team.shortName}.` : undefined}
        />
      </div>

      {team.captains.length > 0 ? (
        <section
          aria-labelledby="team-captains"
          className="border-subtle mb-6 rounded-xl border p-4"
        >
          <h2
            id="team-captains"
            className="text-brand text-sm font-bold tracking-[0.16em] uppercase"
          >
            {team.captains.length === 1 ? "Team captain" : "Team captains"}
          </h2>
          <ul className="mt-2 space-y-1">
            {team.captains.map((captain) => (
              <li key={captain.id} className="text-xs font-medium">
                {captain.name}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted mb-6 text-sm">No captains on record.</p>
      )}

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <dl className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-5 w-5 rounded ring-1 ring-black/20 dark:ring-white/25"
              style={{ backgroundColor: resolveKit(team, "PRIMARY") }}
            />
            <div>
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                Primary kit
              </dt>
              <dd className="text-xs">{kitColorName(resolveKit(team, "PRIMARY"))}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-5 w-5 rounded ring-1 ring-black/20 dark:ring-white/25"
              style={{ backgroundColor: resolveKit(team, "ALTERNATE") }}
            />
            <div>
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                Alternate kit
              </dt>
              <dd className="text-xs">{kitColorName(resolveKit(team, "ALTERNATE"))}</dd>
            </div>
          </div>
        </dl>
      </div>

      {summary.length > 0 ? (
        <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summary.map((item) => (
            <Card key={item.label} className="p-3">
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                {item.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold">{item.value}</dd>
            </Card>
          ))}
        </dl>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section aria-labelledby="team-results">
            <h2 id="team-results" className="mb-3 text-lg font-semibold">
              Results
            </h2>
            {played.length === 0 ? (
              <EmptyState title="No results yet" />
            ) : (
              <MatchList matches={[...played].reverse()} />
            )}
          </section>

          <section aria-labelledby="team-fixtures">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="team-fixtures" className="text-lg font-semibold">
                Upcoming fixtures
              </h2>
              <CalendarViewToggle view={view} basePath={`/teams/${id}`} />
            </div>
            {view === "calendar" ? (
              <FixtureCalendar
                matches={calendarMatches}
                year={monthValue.year}
                month={monthValue.month}
                basePath={`/teams/${id}`}
                query={{ view: "calendar" }}
                showFixtureDetails
                emptyHint={`${team.name} have nothing scheduled this month.`}
              />
            ) : upcoming.length === 0 ? (
              <EmptyState title="No fixtures scheduled" />
            ) : (
              <MatchList matches={upcoming} actions={rescheduleActions} />
            )}
          </section>
        </div>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Disciplinary record</h2>
          {row ? (
            <Card className="mb-3 flex gap-4 p-4 text-sm">
              <span>
                <span className="text-lg font-semibold">{row.yellowCards}</span>{" "}
                <span className="text-muted text-xs">yellow</span>
              </span>
              <span>
                <span className="text-lg font-semibold">{row.redCards}</span>{" "}
                <span className="text-muted text-xs">red</span>
              </span>
            </Card>
          ) : null}
          {teamCards.length === 0 ? (
            <EmptyState title="No cards recorded" />
          ) : (
            <Card className="divide-subtle divide-y">
              {teamCards.slice(0, 20).map((card) => (
                <div key={card.id} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className={
                      card.type === "RED"
                        ? "bg-danger h-5 w-3.5 shrink-0 rounded-sm"
                        : "h-5 w-3.5 shrink-0 rounded-sm bg-yellow-400"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{card.playerName}</p>
                    <p className="text-muted text-xs">
                      {CARD_LABELS[card.type as CardType] ?? card.type}
                      {card.matchLabel ? ` \u00b7 ${card.matchLabel}` : ""}
                    </p>
                  </div>
                  <span className="text-muted shrink-0 text-xs">{formatDate(card.createdAt)}</span>
                </div>
              ))}
            </Card>
          )}
          <p className="text-muted mt-4 text-xs">
            Cards come from referee game reports and league sanctions. They feed the final standings
            tiebreaker.
          </p>
        </aside>
      </div>
    </div>
  );
}
