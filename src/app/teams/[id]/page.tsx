import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchList } from "@/components/match-display";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  getPlayerStats,
  getStandingsForSeason,
  getTeamDetail,
  getTeamMatches,
} from "@/lib/queries";

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

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getTeamDetail(id);
  if (!team) notFound();

  const [matches, standings, playerStats] = await Promise.all([
    getTeamMatches(team.id),
    getStandingsForSeason(team.division.seasonId),
    getPlayerStats(team.division.seasonId),
  ]);

  const row = standings
    .find((d) => d.divisionId === team.division.id)
    ?.rows.find((r) => r.teamId === team.id);

  const played = matches.filter((m) => m.report);
  const upcoming = matches.filter((m) => !m.report && m.status !== "CANCELLED");
  const teamStats = playerStats
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.goals - a.goals || b.disciplinaryPoints - a.disciplinaryPoints);
  const goalsByPlayer = new Map(teamStats.map((p) => [p.playerId, p]));

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
      <PageHeader
        eyebrow={team.division.name}
        title={`${team.crestEmoji ?? "\u26bd"} ${team.name}`}
        description={
          <>
            {team.shortName ? `Also known as ${team.shortName}. ` : ""}
            {team.captainName ? `Captain: ${team.captainName}.` : "No captain on record."}
          </>
        }
      />

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
            <h2 id="team-fixtures" className="mb-3 text-lg font-semibold">
              Upcoming fixtures
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState title="No fixtures scheduled" />
            ) : (
              <MatchList matches={upcoming} />
            )}
          </section>
        </div>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Roster</h2>
          {team.players.length === 0 ? (
            <EmptyState title="No players registered" />
          ) : (
            <Card className="divide-subtle divide-y">
              {team.players.map((player) => {
                const stats = goalsByPlayer.get(player.id);
                return (
                  <div key={player.id} className="flex items-center gap-3 p-3">
                    <span className="bg-surface-muted text-muted inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {player.jerseyNumber ?? "\u2013"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {player.firstName} {player.lastName}
                        {player.active ? null : <span className="text-muted"> (inactive)</span>}
                      </p>
                      <p className="text-muted text-xs">{player.position ?? "Unlisted"}</p>
                    </div>
                    {stats ? (
                      <span className="text-muted shrink-0 text-xs" title="Goals / yellow / red">
                        {stats.goals}G{stats.yellowCards ? ` ${stats.yellowCards}Y` : ""}
                        {stats.redCards ? ` ${stats.redCards}R` : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          )}
          <p className="text-muted mt-4 text-xs">
            Player statistics are derived from referee game reports.{" "}
            <Link href="/players/stats" className="underline">
              League leaderboards
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
