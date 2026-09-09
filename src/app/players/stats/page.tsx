import type { Metadata } from "next";
import Link from "next/link";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getPlayerStats, getSeasons, resolveSeason } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Player statistics",
  description: "MSSL top scorers and disciplinary leaderboard, derived from referee game reports.",
};
export const dynamic = "force-dynamic";

function StatTable({
  caption,
  rows,
  columns,
}: {
  caption: string;
  rows: {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    divisionName: string;
  }[];
  columns: { label: string; title: string; render: (index: number) => string | number }[];
}) {
  return (
    <div className="border-subtle overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-muted text-xs uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">
              #
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              Player
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              Team
            </th>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className="px-2 py-2 text-right"
                title={column.title}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-subtle divide-y">
          {rows.map((row, index) => (
            <tr key={row.playerId} className="hover:bg-surface-muted/60">
              <td className="text-muted px-3 py-2 tabular-nums">{index + 1}</td>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {row.playerName}
              </th>
              <td className="px-3 py-2">
                <Link href={`/teams/${row.teamId}`} className="hover:underline">
                  {row.teamName}
                </Link>
                <span className="text-muted block text-xs">{row.divisionName}</span>
              </td>
              {columns.map((column) => (
                <td key={column.label} className="px-2 py-2 text-right tabular-nums">
                  {column.render(index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PlayerStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const [seasons, season] = await Promise.all([getSeasons(), resolveSeason(seasonParam)]);

  if (!season) {
    return (
      <div>
        <PageHeader title="Player statistics" />
        <EmptyState title="No seasons yet" hint="Run npm run seed to load sample data." />
      </div>
    );
  }

  const stats = await getPlayerStats(season.id);

  const scorers = [...stats]
    .filter((p) => p.goals > 0)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        a.appearances - b.appearances ||
        a.playerName.localeCompare(b.playerName),
    )
    .slice(0, 25);

  const discipline = [...stats]
    .filter((p) => p.disciplinaryPoints > 0)
    .sort(
      (a, b) =>
        b.disciplinaryPoints - a.disciplinaryPoints ||
        b.redCards - a.redCards ||
        a.playerName.localeCompare(b.playerName),
    )
    .slice(0, 25);

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Player statistics"
        description="Straight out of the goal and card events that referees itemise on every game report. Own goals are credited to the opposing team and are never counted as a player's goal."
      />

      {seasons.length > 1 ? (
        <nav aria-label="Season" className="mb-6 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/players/stats?season=${s.slug}`}
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

      <div className="space-y-10">
        <section aria-labelledby="top-scorers">
          <h2 id="top-scorers" className="mb-3 text-lg font-semibold">
            Top scorers
          </h2>
          {scorers.length === 0 ? (
            <Card className="p-6">
              <EmptyState
                title="No goals recorded yet"
                hint="Goals appear as soon as a referee submits a game report."
              />
            </Card>
          ) : (
            <StatTable
              caption={`Top scorers in ${season.name}`}
              rows={scorers}
              columns={[
                { label: "Gls", title: "Goals", render: (i) => scorers[i].goals },
                { label: "Pen", title: "Penalties", render: (i) => scorers[i].penalties },
                {
                  label: "Apps",
                  title: "Matches with a recorded event",
                  render: (i) => scorers[i].appearances,
                },
              ]}
            />
          )}
        </section>

        <section aria-labelledby="discipline">
          <h2 id="discipline" className="mb-3 text-lg font-semibold">
            Disciplinary leaderboard
          </h2>
          <p className="text-muted mb-3 text-sm">
            Disciplinary points: 1 per yellow card, 3 per red card. They are also the final
            tiebreaker in the league table.
          </p>
          {discipline.length === 0 ? (
            <Card className="p-6">
              <EmptyState title="A remarkably clean league so far" />
            </Card>
          ) : (
            <StatTable
              caption={`Disciplinary leaderboard for ${season.name}`}
              rows={discipline}
              columns={[
                { label: "Y", title: "Yellow cards", render: (i) => discipline[i].yellowCards },
                { label: "R", title: "Red cards", render: (i) => discipline[i].redCards },
                {
                  label: "Pts",
                  title: "Disciplinary points",
                  render: (i) => discipline[i].disciplinaryPoints,
                },
              ]}
            />
          )}
        </section>
      </div>
    </div>
  );
}
