import type { Metadata } from "next";
import Link from "next/link";

import { StandingsTable } from "@/components/match-display";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { config } from "@/lib/config";
import { getSeasons, getStandingsForSeason, resolveSeason } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Standings",
  description: "MSSL league tables, computed entirely from submitted referee game reports.",
};
export const dynamic = "force-dynamic";

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const [seasons, season] = await Promise.all([getSeasons(), resolveSeason(seasonParam)]);

  if (!season) {
    return (
      <div>
        <PageHeader title="Standings" />
        <EmptyState title="No seasons yet" hint="Run npm run seed to load sample data." />
      </div>
    );
  }

  const divisions = await getStandingsForSeason(season.id);
  const hasRows = divisions.some((d) => d.rows.length > 0);

  return (
    <div>
      <PageHeader
        eyebrow="League tables"
        title="Standings"
        description="Every number below is derived from referee game reports. Nothing here is typed in by hand."
      />

      {seasons.length > 1 ? (
        <nav aria-label="Season" className="mb-6 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/standings?season=${s.slug}`}
              aria-current={s.id === season.id ? "page" : undefined}
              className={
                s.id === season.id
                  ? "bg-brand text-brand-contrast rounded-full px-3 py-1.5 text-sm font-medium"
                  : "border-subtle hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm"
              }
            >
              {s.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <Alert tone="info" title="How these tables are built">
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>3 points for a win, 1 for a draw, 0 for a loss.</li>
          <li>
            Tiebreakers in order: points, goal difference, goals for, head-to-head, then fewest
            disciplinary points.
          </li>
          <li>
            Forfeits are recorded as {config.standings.forfeit.winner}&ndash;
            {config.standings.forfeit.loser}.
          </li>
          <li>
            {config.standings.includeUnconfirmed
              ? "Submitted reports count immediately, before an admin confirms them."
              : "Only admin-confirmed reports count."}
          </li>
          <li>
            A league administrator may apply a points adjustment for a disciplinary or
            administrative sanction. Any adjustment is shown beside that team&rsquo;s points total.
          </li>
        </ul>
      </Alert>

      {!hasRows ? (
        <div className="mt-6">
          <EmptyState
            title="No teams in this season"
            hint="Add divisions and teams in Match Control."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {divisions.map((division) => (
            <section key={division.divisionId} aria-labelledby={`div-${division.divisionId}`}>
              <h2 id={`div-${division.divisionId}`} className="mb-3 text-lg font-semibold">
                {division.divisionName}
              </h2>
              {division.rows.length === 0 ? (
                <Card className="p-6">
                  <EmptyState title="No teams in this division yet" />
                </Card>
              ) : (
                <StandingsTable
                  rows={division.rows}
                  caption={`${division.divisionName} table for ${season.name}`}
                />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
