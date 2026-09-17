import Link from "next/link";

import { FieldError } from "@/components/admin-forms";
import { ClickableRow } from "@/components/clickable-row";
import { CalendarViewToggle, FixtureCalendar, parseView } from "@/components/fixture-calendar";
import { Dialog, FormDialog } from "@/components/form-dialog";
import { MatchKitPicker } from "@/components/match-kit-picker";
import { ScheduleImportForm } from "@/components/schedule-import-form";
import { KitSwatch } from "@/components/team-colors";
import {
  Card,
  EmptyState,
  Field,
  MatchStatusBadge,
  inputClass,
  outlineButtonClass,
} from "@/components/ui";
import { createMatchAction } from "@/app/admin/actions";
import { formatDateTime, parseMonthValue, shiftMonth, toDateTimeInputValue } from "@/lib/dates";
import {
  MATCH_DISPLAY_LABELS,
  MATCH_DISPLAY_STATUSES,
  isMatchDisplayStatus,
  matchDisplayWhere,
} from "@/lib/match-status";
import { prisma } from "@/lib/prisma";
import { getActiveSeason, listMatches, scoreText } from "@/lib/queries";
import { zonedToUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

interface Params {
  status?: string;
  division?: string;
  q?: string;
  season?: string;
  view?: string;
  month?: string;
  when?: string;
}

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const seasons = await prisma.season.findMany({ orderBy: { startsOn: "desc" } });
  const active = await getActiveSeason();
  const seasonId = params.season ?? active?.id ?? seasons[0]?.id;

  if (!seasonId) {
    return <EmptyState title="Create a season first" hint="Head to League setup." />;
  }

  // Admins are nearly always working on fixtures that have not been played yet,
  // so "upcoming" is the default and "all dates" is the opt-in. A select rather
  // than a checkbox: an unticked checkbox submits nothing, which is
  // indistinguishable from "no preference" and would snap straight back to the
  // default.
  const when = params.when === "all" ? "all" : "upcoming";

  const where: Record<string, unknown> = { seasonId };
  // Filtering on what the badge says, not on the stored column: "waiting
  // report" and "not started" are both SCHEDULED underneath, so the raw status
  // would not tell them apart.
  const status = params.status && isMatchDisplayStatus(params.status) ? params.status : undefined;
  if (status) where.AND = [matchDisplayWhere(status)];
  if (params.division) where.divisionId = params.division;
  if (when === "upcoming") where.kickoffAt = { gte: new Date() };
  if (params.q) {
    where.OR = [
      { homeTeam: { name: { contains: params.q } } },
      { awayTeam: { name: { contains: params.q } } },
    ];
  }

  const [divisions, teams, matches] = await Promise.all([
    prisma.division.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.match.findMany({
      where,
      orderBy: [{ kickoffAt: "asc" }],
      take: 200,
      include: {
        homeTeam: { select: { name: true, colorPrimary: true, colorAlternate: true } },
        awayTeam: { select: { name: true, colorPrimary: true, colorAlternate: true } },
        division: { select: { name: true } },
        referee: { select: { name: true } },
        report: {
          select: {
            homeScore: true,
            awayScore: true,
            homeForfeit: true,
            awayForfeit: true,
            status: true,
          },
        },
      },
    }),
  ]);

  // The calendar covers one whole league-time month, so it replaces the list's
  // ordering, its 200-row cap and its upcoming-only window. The other filters
  // (season, division, status, team) still apply.
  const view = parseView(params.view);
  const { year, month } = parseMonthValue(params.month);
  const next = shiftMonth(year, month, 1);
  const calendarMatches =
    view === "calendar"
      ? await listMatches({
          ...where,
          kickoffAt: { gte: zonedToUtc(year, month, 1), lt: zonedToUtc(next.year, next.month, 1) },
        })
      : [];

  const carried = {
    season: params.season,
    division: params.division,
    status: status,
    q: params.q,
    month: params.month,
    when: params.when,
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="filters">
        <h2 id="filters" className="sr-only">
          Filters
        </h2>
        <Card className="p-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <input type="hidden" name="view" value={view} />
            {params.month ? <input type="hidden" name="month" value={params.month} /> : null}
            <Field label="Season" htmlFor="season">
              <select id="season" name="season" defaultValue={seasonId} className={inputClass}>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Division" htmlFor="division">
              <select
                id="division"
                name="division"
                defaultValue={params.division ?? ""}
                className={inputClass}
              >
                <option value="">All</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dates" htmlFor="when">
              <select id="when" name="when" defaultValue={when} className={inputClass}>
                <option value="upcoming">Upcoming only</option>
                <option value="all">All dates</option>
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" defaultValue={status ?? ""} className={inputClass}>
                <option value="">All</option>
                {MATCH_DISPLAY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MATCH_DISPLAY_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team contains" htmlFor="q">
              <input id="q" name="q" defaultValue={params.q ?? ""} className={inputClass} />
            </Field>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-medium"
              >
                Apply
              </button>
              <Link
                href={`/admin/matches?view=${view}`}
                className="text-muted px-2 py-2 text-sm hover:underline"
              >
                Reset
              </Link>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="fixture-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="fixture-list" className="text-lg font-semibold">
            {view === "calendar"
              ? `Fixture calendar (${calendarMatches.length})`
              : `Fixtures (${matches.length})`}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <FormDialog
              trigger="Add fixture"
              title="Add a fixture"
              action={createMatchAction}
              submitLabel="Create fixture"
              fieldsClassName="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="seasonId" value={seasonId} />
              <Field label="Matchweek" htmlFor="new-mw">
                <input
                  id="new-mw"
                  name="matchweek"
                  type="text"
                  maxLength={40}
                  defaultValue="1"
                  placeholder="7 or Final"
                  className={inputClass}
                  required
                />
                <FieldError name="matchweek" />
              </Field>
              <Field label="Counts for standings" htmlFor="new-counts">
                <label className="flex items-center gap-2 py-2 text-sm">
                  <input
                    id="new-counts"
                    name="countsForStandings"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4"
                  />
                  Include this result in the league table
                </label>
                <p className="text-muted text-xs">
                  Clear it for a final, play-off or friendly. The fixture still appears everywhere
                  else.
                </p>
                <FieldError name="countsForStandings" />
              </Field>
              <MatchKitPicker
                divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
                teams={teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  divisionId: t.divisionId,
                  colorPrimary: t.colorPrimary,
                  colorAlternate: t.colorAlternate,
                }))}
              />
              <Field label="Kick-off" htmlFor="new-kickoff">
                <input
                  id="new-kickoff"
                  name="kickoffAt"
                  type="datetime-local"
                  defaultValue={toDateTimeInputValue(new Date())}
                  className={inputClass}
                  required
                />
                <FieldError name="kickoffAt" />
              </Field>
              <Field
                label="Venue"
                htmlFor="new-venue"
                hint="Free text, shown exactly as typed. Blank shows as TBD."
              >
                <input
                  id="new-venue"
                  name="venueName"
                  type="text"
                  maxLength={200}
                  placeholder="To be confirmed"
                  className={inputClass}
                />
                <FieldError name="venueName" />
              </Field>
            </FormDialog>
            {/*
              Exactly the columns the importer reads back, so an organiser can
              export a season, edit it in Excel and re-upload it as a template.
            */}
            <a
              href={`/admin/schedule.csv?season=${encodeURIComponent(seasonId)}`}
              download
              className={outlineButtonClass}
            >
              Download CSV
            </a>
            <Dialog
              trigger="Upload CSV"
              triggerClassName={outlineButtonClass}
              title="Import a schedule"
              description="Paste or upload a CSV, dry run it to see exactly what would change, then import the valid rows."
              widthClassName="w-[min(64rem,calc(100vw-2rem))]"
            >
              <ScheduleImportForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} />
            </Dialog>
            <CalendarViewToggle view={view} basePath="/admin/matches" query={carried} />
          </div>
        </div>
        {view === "calendar" ? (
          <FixtureCalendar
            matches={calendarMatches}
            year={year}
            month={month}
            basePath="/admin/matches"
            query={{ ...carried, month: undefined, view: "calendar" }}
            hrefForMatch={(match) => `/admin/matches/${match.id}`}
            emptyHint="No fixtures are scheduled this month for the current filters."
          />
        ) : matches.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No fixtures match those filters"
              hint={
                when === "upcoming"
                  ? "Only upcoming fixtures are shown \u2014 switch Dates to \u201cAll dates\u201d to include played matches."
                  : undefined
              }
            />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="data-table w-full min-w-[46rem] text-sm">
              <caption className="sr-only">
                Fixtures for the selected filters. Selecting a row opens its management page.
              </caption>
              <thead className="text-muted text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">MW</th>
                  <th className="px-3 py-2 text-left">Kick-off</th>
                  <th className="px-3 py-2 text-left">Fixture</th>
                  <th className="px-3 py-2 text-left">Division</th>
                  <th className="px-3 py-2 text-left">Referee</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const score = scoreText(match.report);
                  return (
                    <ClickableRow key={match.id} href={`/admin/matches/${match.id}`}>
                      <td className="text-muted px-3 py-2">
                        {match.matchweek}
                        {match.countsForStandings ? null : (
                          <span
                            className="dark:bg-warning/10 dark:text-warning ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-semibold tracking-wide text-amber-900"
                            title="This fixture is excluded from the league table."
                          >
                            <span className="sr-only">Does not count towards the standings, </span>
                            NL
                          </span>
                        )}
                      </td>
                      <td className="text-muted px-3 py-2 whitespace-nowrap">
                        {formatDateTime(match.kickoffAt)}
                      </td>
                      <td className="px-3 py-2">
                        {/*
                        The whole row is clickable, but this link is what
                        keyboard users tab to and what still works with
                        JavaScript disabled.
                      */}
                        <Link
                          href={`/admin/matches/${match.id}`}
                          className="hover:text-brand inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-medium hover:underline"
                        >
                          {/*
                          "FT" leads the line so a scanned column of fixtures
                          separates played from scheduled at a glance, without
                          reading the status badge at the far right.
                        */}
                          {match.report ? (
                            <span className="dark:bg-success/10 dark:text-success rounded bg-emerald-100 px-1 py-px text-[10px] font-semibold tracking-wide text-emerald-800">
                              <span className="sr-only">Full time, </span>FT
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1.5">
                            <KitSwatch
                              team={match.homeTeam}
                              kit={match.homeKit}
                              teamName={match.homeTeam.name}
                            />
                            {match.homeTeam.name}
                          </span>
                          {/*
                          The result reads inline with the fixture — "Home 2–1
                          Away" — so a separate score column is not needed and
                          the table stays narrow enough for a laptop.
                        */}
                          {score ? (
                            <span className="font-mono font-semibold tabular-nums">{score}</span>
                          ) : (
                            <span className="text-muted text-xs font-normal">vs</span>
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <KitSwatch
                              team={match.awayTeam}
                              kit={match.awayKit}
                              teamName={match.awayTeam.name}
                            />
                            {match.awayTeam.name}
                          </span>
                        </Link>
                        {match.venueName ? (
                          <span className="text-muted block text-xs">{match.venueName}</span>
                        ) : null}
                      </td>
                      <td className="text-muted px-3 py-2">{match.division.name}</td>
                      <td className="text-muted px-3 py-2">{match.referee?.name ?? "\u2014"}</td>
                      <td className="px-3 py-2">
                        <MatchStatusBadge match={match} />
                      </td>
                    </ClickableRow>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

export const metadata = { title: "Match Control" };
