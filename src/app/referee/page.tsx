import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

import { ActionButton } from "@/components/match-actions";
import { CalendarViewToggle, FixtureCalendar, parseView } from "@/components/fixture-calendar";
import { FixtureLine } from "@/components/match-display";
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  buttonClass,
  inputClass,
  labelClass,
} from "@/components/ui";
import { MatchStatusBadge } from "@/components/ui";
import { AuthzError, requireReferee } from "@/lib/authz";
import { formatDateTime, parseMonthValue, shiftMonth } from "@/lib/dates";
import { zonedToUtc } from "@/lib/timezone";
import { MATCH_STATUS_LABELS, type MatchStatus } from "@/lib/enums";
import { getActiveSeason, getDivisions, listMatches, scoreText } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Referee Control" };
export const dynamic = "force-dynamic";

interface RefereeParams {
  from?: string;
  to?: string;
  division?: string;
  venue?: string;
  view?: string;
  month?: string;
  myView?: string;
  myMonth?: string;
}

export default async function RefereePage({
  searchParams,
}: {
  searchParams: Promise<RefereeParams>;
}) {
  let context;
  try {
    context = await requireReferee();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/referee");
      forbidden();
    }
    throw error;
  }

  const { user, referee } = context;
  const params = await searchParams;
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div>
        <PageHeader title="Referee Control" />
        <EmptyState title="No active season" hint="Ask an admin to create one in Match Control." />
      </div>
    );
  }

  const [divisions, venues] = await Promise.all([
    getDivisions(),
    // Venues are free text on the match, so the filter options are whatever
    // names have actually been typed onto this season's fixtures.
    prisma.match.findMany({
      where: { seasonId: season.id, venueName: { not: null } },
      distinct: ["venueName"],
      orderBy: { venueName: "asc" },
      select: { venueName: true },
    }),
  ]);

  // --- Available matches -----------------------------------------------------
  const availableWhere: Record<string, unknown> = {
    seasonId: season.id,
    refereeId: null,
    status: { in: ["SCHEDULED"] },
  };
  if (params.division) availableWhere.divisionId = params.division;
  if (params.venue) availableWhere.venueName = params.venue;

  const kickoff: Record<string, Date> = {};
  if (params.from) kickoff.gte = new Date(`${params.from}T00:00:00.000Z`);
  if (params.to) kickoff.lte = new Date(`${params.to}T23:59:59.999Z`);
  if (Object.keys(kickoff).length > 0) availableWhere.kickoffAt = kickoff;

  const [available, mine] = await Promise.all([
    // Deliberately uncapped. A cap here silently disagreed with the calendar,
    // which has never been capped: a referee saw the list stop partway through
    // the season while the month grid kept showing fixtures beyond it. Two
    // views of the same query must not contradict each other, and the date and
    // division filters below are the intended way to narrow this down.
    listMatches(availableWhere),
    listMatches({ refereeId: referee.id }),
  ]);

  const active = mine.filter((m) => m.status === "ASSIGNED");
  const history = mine.filter((m) => m.status !== "ASSIGNED");

  // --- Calendars -------------------------------------------------------------
  // The two sections answer different questions — "when am I working?" versus
  // "what could I pick up?" — so each carries its own view and month. A referee
  // can hold their commitments as a month grid while still scanning open
  // fixtures as a filtered list.
  //
  // The month views deliberately ignore the date filters and show the whole
  // month, because the question they answer is "what does my weekend look
  // like?".
  const view = parseView(params.view);
  const myView = parseView(params.myView);
  const { year, month } = parseMonthValue(params.month);
  const myMonthValue = parseMonthValue(params.myMonth);
  // Month boundaries are league-time midnights: a 16:30 Redmond kickoff on 31
  // January is 00:30 UTC on 1 February, and belongs to January's grid.
  const next = shiftMonth(year, month, 1);
  const monthStart = zonedToUtc(year, month, 1);
  const monthEnd = zonedToUtc(next.year, next.month, 1);

  const myNext = shiftMonth(myMonthValue.year, myMonthValue.month, 1);
  const myMonthStart = zonedToUtc(myMonthValue.year, myMonthValue.month, 1);
  const myMonthEnd = zonedToUtc(myNext.year, myNext.month, 1);

  // Open fixtures *plus* the referee's own assignments for the same month.
  // Seeing only the open ones answered "what could I take?" but not "am I
  // already busy that day?" — the two questions are always asked together, so
  // the assignments are drawn in alongside, ticked and tinted green.
  const calendarMatches =
    view === "calendar"
      ? await listMatches({
          seasonId: season.id,
          kickoffAt: { gte: monthStart, lt: monthEnd },
          OR: [
            { refereeId: null, status: { in: ["SCHEDULED"] } },
            { refereeId: referee.id, status: { in: ["ASSIGNED", "LOCKED"] } },
          ],
          ...(params.division ? { divisionId: params.division } : {}),
          ...(params.venue ? { venueName: params.venue } : {}),
        })
      : [];

  // Derived from the same `active` array the list renders, not from a second
  // query. A separate query drifted: it had no status filter, so the calendar
  // showed every match the referee had ever been attached to — including
  // submitted and confirmed ones that belong under "Your history". Sharing the
  // source means the two views cannot disagree about what is assigned.
  const myCalendarMatches =
    myView === "calendar"
      ? active.filter((m) => m.kickoffAt >= myMonthStart && m.kickoffAt < myMonthEnd)
      : [];

  // Every link has to carry the *other* section's state, or switching one view
  // would silently reset the other.
  const carried = {
    from: params.from,
    to: params.to,
    division: params.division,
    venue: params.venue,
    month: params.month,
    myView: params.myView,
    myMonth: params.myMonth,
  };

  const myCarried = {
    from: params.from,
    to: params.to,
    division: params.division,
    venue: params.venue,
    view: params.view,
    month: params.month,
    myMonth: params.myMonth,
  };

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Referee Control"
        description={`Signed in as ${referee.name}. Claim an open fixture \u2014 that locks it to you \u2014 then file the game report.`}
      />

      {user.isDevBypass ? (
        <Alert tone="warning" title="Development session">
          Roles come from the dev bypass, not from the <code className="font-mono">msslrefs</code>{" "}
          distribution list.
        </Alert>
      ) : null}

      {/* ------------------------------ My matches --------------------------- */}
      <section aria-labelledby="my-active" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="my-active" className="text-lg font-semibold">
            {myView === "calendar" ? "Your calendar" : "Your current assignments"}
          </h2>
          <CalendarViewToggle view={myView} basePath="/referee" query={myCarried} param="myView" />
        </div>
        {myView === "calendar" ? (
          <FixtureCalendar
            matches={myCalendarMatches}
            year={myMonthValue.year}
            month={myMonthValue.month}
            basePath="/referee"
            query={{ ...myCarried, myMonth: undefined, myView: "calendar" }}
            monthParam="myMonth"
            hrefForMatch={(match) => `/referee/${match.id}`}
            emptyHint="Matches you have claimed appear here. Use the arrows to look ahead."
          />
        ) : active.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="Nothing assigned to you right now"
              hint="Claim a match from the list below."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {active.map((match) => (
              <Card key={match.id} as="li" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <MatchStatusBadge match={match} />
                      <span className="text-muted text-xs">{match.division.name}</span>
                    </div>
                    <FixtureLine className="mt-1" match={match} href={`/referee/${match.id}`} />
                    <p className="text-muted text-sm">
                      {formatDateTime(match.kickoffAt)}
                      {match.venueName ? ` \u00b7 ${match.venueName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {match.status === "ASSIGNED" ? (
                      <ActionButton
                        url={`/api/matches/${match.id}/unassign`}
                        label="Release"
                        variant="ghost"
                        confirm="Release this match so another referee can claim it?"
                      />
                    ) : null}
                    <Link href={`/referee/${match.id}`} className={buttonClass("outline")}>
                      {match.report ? "Open" : "File report"}
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------- Available matches ------------------------ */}
      <section aria-labelledby="available" className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="available" className="text-lg font-semibold">
            {view === "calendar" ? (
              "Open fixtures calendar"
            ) : (
              <>
                Available matches{" "}
                {/* The count makes it obvious the list is complete rather than
                    cut short — the symptom that a row cap used to cause. */}
                <span className="text-muted font-normal">{`(${available.length})`}</span>
              </>
            )}
          </h2>
          <CalendarViewToggle view={view} basePath="/referee" query={carried} />
        </div>

        {/*
          The calendar mixes open fixtures with the referee's own, so it says
          which is which. The list below has no such ambiguity.
        */}
        {view === "calendar" ? (
          <p className="text-muted mb-3 text-sm">
            Open fixtures, plus your own assignments marked{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              <Check aria-hidden="true" size={14} className="inline-block align-text-bottom" />
            </span>{" "}
            so you can spot a clash before claiming.
          </p>
        ) : null}

        <Card className="mb-4 p-4">
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Keep the current view and month when the filters are applied. */}
            <input type="hidden" name="view" value={view} />
            {params.month ? <input type="hidden" name="month" value={params.month} /> : null}
            {/* Filtering open fixtures must not reset how the referee is
                looking at their own assignments. */}
            {params.myView ? <input type="hidden" name="myView" value={params.myView} /> : null}
            {params.myMonth ? <input type="hidden" name="myMonth" value={params.myMonth} /> : null}
            {view === "calendar" ? null : (
              <>
                <div>
                  <label className={labelClass} htmlFor="from">
                    From
                  </label>
                  <input
                    id="from"
                    name="from"
                    type="date"
                    defaultValue={params.from ?? ""}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="to">
                    To
                  </label>
                  <input
                    id="to"
                    name="to"
                    type="date"
                    defaultValue={params.to ?? ""}
                    className={inputClass}
                  />
                </div>
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="division">
                Division
              </label>
              <select
                id="division"
                name="division"
                defaultValue={params.division ?? ""}
                className={inputClass}
              >
                <option value="">All divisions</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="venue">
                Venue
              </label>
              <select
                id="venue"
                name="venue"
                defaultValue={params.venue ?? ""}
                className={inputClass}
              >
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.venueName!} value={v.venueName!}>
                    {v.venueName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-medium"
              >
                Filter
              </button>
              <Link
                href={`/referee?view=${view}${params.myView ? `&myView=${params.myView}` : ""}`}
                className="text-muted px-2 py-2 text-sm hover:underline"
              >
                Reset
              </Link>
            </div>
          </form>
        </Card>

        {view === "calendar" ? (
          <FixtureCalendar
            matches={calendarMatches}
            year={year}
            month={month}
            basePath="/referee"
            query={{ ...carried, month: undefined, view: "calendar" }}
            hrefForMatch={(match) => `/referee/${match.id}`}
            markFor={(match) =>
              match.refereeId === referee.id ? "Already assigned to you" : undefined
            }
            emptyHint="Open fixtures appear here. Use the arrows to look ahead."
          />
        ) : available.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No unassigned matches match those filters"
              hint="Every fixture may already have a referee."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {available.map((match) => (
              <Card key={match.id} as="li" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted text-xs">
                      {match.division.name} &middot; MW {match.matchweek}
                    </p>
                    <FixtureLine className="mt-0.5" match={match} href={`/referee/${match.id}`} />
                    <p className="text-muted text-sm">
                      {formatDateTime(match.kickoffAt)}
                      {match.venueName ? ` \u00b7 ${match.venueName}` : ""}
                    </p>
                  </div>
                  <ActionButton
                    url={`/api/matches/${match.id}/assign`}
                    body={{ expectedVersion: match.version }}
                    label="Assign me"
                    variant="outline"
                    pendingLabel={"Claiming\u2026"}
                  />
                </div>
              </Card>
            ))}
          </ul>
        )}
        <p className="text-muted mt-3 text-xs">
          Assignment is race-safe: if another referee claims a match first you will get a clear
          &ldquo;already assigned&rdquo; message rather than a double booking.
        </p>
      </section>

      {/* ------------------------------- History ------------------------------ */}
      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="mb-3 text-lg font-semibold">
          Your history
        </h2>
        {history.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No completed matches yet" />
          </Card>
        ) : (
          <Card className="divide-subtle divide-y">
            {history.map((match) => (
              <Link
                key={match.id}
                href={`/referee/${match.id}`}
                className="hover:bg-surface-muted flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {match.homeTeam.name} v {match.awayTeam.name}
                  </p>
                  <p className="text-muted text-xs">
                    {formatDateTime(match.kickoffAt)} &middot; {match.division.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {match.report ? (
                    <span className="font-mono text-sm font-semibold">
                      {scoreText(match.report)}
                    </span>
                  ) : null}
                  <span className="text-muted text-xs">
                    {MATCH_STATUS_LABELS[match.status as MatchStatus]}
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
