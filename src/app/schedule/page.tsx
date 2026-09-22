import type { Metadata } from "next";
import Link from "next/link";

import { CalendarViewToggle, FixtureCalendar, parseView } from "@/components/fixture-calendar";
import { MatchList } from "@/components/match-display";
import { ButtonLink, Card, EmptyState, PageHeader, inputClass, labelClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import { parseMonthValue, shiftMonth } from "@/lib/dates";
import { compareMatchweeks } from "@/lib/matchweek";
import { getDivisions, getSeasons, listMatches, resolveSeason } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { zonedToUtc } from "@/lib/timezone";

export const metadata: Metadata = {
  title: "Schedule",
  description: "MSSL fixtures and results, filterable by division, team and matchweek.",
};
export const dynamic = "force-dynamic";

interface ScheduleParams {
  season?: string;
  division?: string;
  team?: string;
  matchweek?: string;
  view?: string;
  layout?: string;
  month?: string;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleParams>;
}) {
  const params = await searchParams;
  const [seasons, season, currentUser] = await Promise.all([
    getSeasons(),
    resolveSeason(params.season),
    getCurrentUser(),
  ]);
  // Anonymous visitors get fixtures and results; who has been appointed to
  // referee them is only shown once you are signed in.

  if (!season) {
    return (
      <div>
        <PageHeader title="Schedule" />
        <EmptyState title="No seasons yet" hint="Run npm run seed to load sample data." />
      </div>
    );
  }

  const [divisions, teams] = await Promise.all([
    getDivisions(),
    prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Two choices only: what is still to come, or the whole season. A
  // results-only view was dropped as redundant; "All" already carries
  // the played matches, each one showing its own score.
  const view = params.view === "all" ? "all" : "fixtures";
  const matchweek = params.matchweek?.trim() || undefined;

  const where: Record<string, unknown> = { seasonId: season.id };
  if (params.division) where.divisionId = params.division;
  if (params.team) where.OR = [{ homeTeamId: params.team }, { awayTeamId: params.team }];
  if (matchweek) where.matchweek = matchweek;
  /*
    "Upcoming" is about the clock, not about paperwork. Filtering on an absent
    report alone left a match that kicked off weeks ago but never had a result
    filed sitting at the top of the fixture list. Those are reachable under
    "All".
  */
  const upcomingFrom = view === "fixtures" ? new Date() : null;
  if (view === "fixtures") where.report = { is: null };
  if (upcomingFrom) where.kickoffAt = { gte: upcomingFrom };

  const ordered = await listMatches(where);

  /*
    The calendar is a second way of reading the same filters, so it keeps
    season/division/team/matchweek and the fixtures-or-results choice but
    replaces the list's ordering with one whole league-time month. `layout`
    rather than `view`, which this page already spends on that choice.
  */
  const layout = parseView(params.layout);
  const { year, month } = parseMonthValue(params.month);
  const next = shiftMonth(year, month, 1);
  const monthStart = zonedToUtc(year, month, 1);
  const monthEnd = zonedToUtc(next.year, next.month, 1);
  // The month window replaces the list's ordering, but it must not widen the
  // fixtures filter: navigating back to a played month would otherwise resurrect
  // the very past-dated fixtures the list drops.
  const calendarFrom = upcomingFrom && upcomingFrom > monthStart ? upcomingFrom : monthStart;
  const calendarMatches =
    layout === "calendar"
      ? await listMatches({
          ...where,
          kickoffAt: { gte: calendarFrom, lt: monthEnd },
        })
      : [];

  const matchweeks = [...new Set(ordered.map((m) => m.matchweek))].sort(compareMatchweeks);
  const carried = {
    season: params.season,
    division: params.division,
    team: params.team,
    matchweek: params.matchweek,
    view: params.view,
    month: params.month,
  };
  const icsQuery = new URLSearchParams({ season: season.slug });
  if (params.division) icsQuery.set("division", params.division);
  if (params.team) icsQuery.set("team", params.team);

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Schedule"
        description="Kickoff times are shown in Redmond time (Pacific). Subscribe to the calendar feed to get fixtures in Outlook."
        actions={
          <>
            {currentUser?.isCaptain ? (
              <ButtonLink href="/captain/reschedules">Request reschedule</ButtonLink>
            ) : null}
            <ButtonLink href={`/schedule/calendar.ics?${icsQuery.toString()}`} variant="secondary">
              Export .ics
            </ButtonLink>
          </>
        }
      />

      <Card className="p-4">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/*
            The layout and month live outside the form's controls, so they have
            to ride along or applying a filter would throw the reader back to
            the list at the current month.
          */}
          <input type="hidden" name="layout" value={layout} />
          {params.month ? <input type="hidden" name="month" value={params.month} /> : null}
          <div>
            <label className={labelClass} htmlFor="season">
              Season
            </label>
            <select id="season" name="season" defaultValue={season.slug} className={inputClass}>
              {seasons.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
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
            <label className={labelClass} htmlFor="team">
              Team
            </label>
            <select id="team" name="team" defaultValue={params.team ?? ""} className={inputClass}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="matchweek">
              Matchweek
            </label>
            <select
              id="matchweek"
              name="matchweek"
              defaultValue={params.matchweek ?? ""}
              className={inputClass}
            >
              <option value="">All matchweeks</option>
              {matchweeks.map((mw) => (
                <option key={mw} value={mw}>
                  MW {mw}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="view">
              Show
            </label>
            <select id="view" name="view" defaultValue={view} className={inputClass}>
              <option value="fixtures">Upcoming fixtures</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button
              type="submit"
              className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-medium"
            >
              Apply filters
            </button>
            <Link href="/schedule" className="text-muted px-2 py-2 text-sm hover:underline">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-4 mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm" role="status">
          {layout === "calendar"
            ? `${calendarMatches.length} ${calendarMatches.length === 1 ? "match" : "matches"} this month.`
            : `${ordered.length} ${ordered.length === 1 ? "match" : "matches"} found.`}
        </p>
        <CalendarViewToggle view={layout} basePath="/schedule" query={carried} param="layout" />
      </div>

      {layout === "calendar" ? (
        <FixtureCalendar
          matches={calendarMatches}
          year={year}
          month={month}
          basePath="/schedule"
          query={{ ...carried, month: undefined, layout: "calendar" }}
          emptyHint="Nothing is scheduled this month for the current filters."
        />
      ) : ordered.length === 0 ? (
        <EmptyState title="No matches match those filters" hint="Try widening the filters." />
      ) : (
        <MatchList matches={ordered} />
      )}
    </div>
  );
}
