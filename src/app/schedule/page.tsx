import type { Metadata } from "next";
import Link from "next/link";

import { MatchList } from "@/components/match-display";
import { ButtonLink, Card, EmptyState, PageHeader, inputClass, labelClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import { formatLongDate } from "@/lib/dates";
import { compareMatchweeks } from "@/lib/matchweek";
import { getDivisions, getSeasons, listMatches, resolveSeason } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

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
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleParams>;
}) {
  const params = await searchParams;
  const [seasons, season] = await Promise.all([getSeasons(), resolveSeason(params.season)]);
  // Anonymous visitors get fixtures and results; who has been appointed to
  // referee them is only shown once you are signed in.
  const viewer = await getCurrentUser();

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

  const view = params.view === "results" ? "results" : params.view === "all" ? "all" : "fixtures";
  const matchweek = params.matchweek?.trim() || undefined;

  const where: Record<string, unknown> = { seasonId: season.id };
  if (params.division) where.divisionId = params.division;
  if (params.team) where.OR = [{ homeTeamId: params.team }, { awayTeamId: params.team }];
  if (matchweek) where.matchweek = matchweek;
  if (view === "fixtures") where.report = { is: null };
  if (view === "results") where.report = { isNot: null };

  const matches = await listMatches(where);
  const ordered = view === "results" ? [...matches].reverse() : matches;

  const grouped = new Map<string, typeof ordered>();
  for (const match of ordered) {
    const key = formatLongDate(match.kickoffAt);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(match);
    else grouped.set(key, [match]);
  }

  const matchweeks = [...new Set(matches.map((m) => m.matchweek))].sort(compareMatchweeks);
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
          <ButtonLink href={`/schedule/calendar.ics?${icsQuery.toString()}`} variant="secondary">
            Export .ics
          </ButtonLink>
        }
      />

      <Card className="p-4">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <option value="results">Results</option>
              <option value="all">Everything</option>
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

      <p className="text-muted mt-4 text-sm" role="status">
        {matches.length} {matches.length === 1 ? "match" : "matches"} found.
      </p>

      {grouped.size === 0 ? (
        <div className="mt-4">
          <EmptyState title="No matches match those filters" hint="Try widening the filters." />
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          {[...grouped.entries()].map(([day, dayMatches]) => (
            <section key={day} aria-labelledby={`day-${day.replace(/\s/g, "-")}`}>
              <h2
                id={`day-${day.replace(/\s/g, "-")}`}
                className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase"
              >
                {day}
              </h2>
              <MatchList matches={dayMatches} showReferee={Boolean(viewer)} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
