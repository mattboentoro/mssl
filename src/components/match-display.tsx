import Link from "next/link";

import { KitSwatch, TeamColorBar } from "@/components/team-colors";
import { Badge, Card, FormGuide, MatchStatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { MatchListItem } from "@/lib/queries";
import type { StandingsRow } from "@/lib/standings";

/** Score if a report exists, otherwise the kickoff time. */
function scoreLabel(match: MatchListItem): string | null {
  if (!match.report) return null;
  return `${match.report.homeScore} \u2013 ${match.report.awayScore}`;
}

export function MatchRow({ match }: { match: MatchListItem }) {
  const score = scoreLabel(match);

  return (
    <Card as="li" className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted">{formatDateTime(match.kickoffAt)}</span>
        <Badge tone="neutral">{match.division.name}</Badge>
        <Badge tone="neutral">MW{match.matchweek}</Badge>
        <MatchStatusBadge status={match.status} />
        {match.report?.status === "DISPUTED" ? <Badge tone="danger">Disputed</Badge> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <TeamCell team={match.homeTeam} kit={match.homeKit} />
        <div>
          {score ? (
            <span className="text-xl font-bold tabular-nums">{score}</span>
          ) : (
            <span className="text-muted text-sm font-semibold">vs</span>
          )}
          {match.report?.homeForfeit || match.report?.awayForfeit ? (
            <span className="text-danger block text-[10px] font-semibold uppercase">Forfeit</span>
          ) : null}
        </div>
        <TeamCell team={match.awayTeam} kit={match.awayKit} />
      </div>

      <div className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {match.venue ? <span>&#128205; {match.venue.name}</span> : <span>&#128205; TBD</span>}
        <span>&#128100; {match.referee ? match.referee.name : <em>Referee needed</em>}</span>
      </div>
    </Card>
  );
}

type TeamCellTeam = MatchListItem["homeTeam"];

function TeamCell({ team, kit }: { team: TeamCellTeam; kit: string }) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className="flex min-w-0 items-center gap-1.5 text-left font-semibold hover:underline"
    >
      <KitSwatch team={team} kit={kit} teamName={team.name} />
      <span className="truncate">{team.name}</span>
    </Link>
  );
}

export function MatchList({ matches }: { matches: MatchListItem[] }) {
  return (
    <ul className="grid gap-3">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Standings table                                                            */
/* -------------------------------------------------------------------------- */

const TIEBREAKER_LABELS: Record<string, string> = {
  points: "points",
  goalDifference: "goal difference",
  goalsFor: "goals scored",
  headToHead: "head-to-head",
  disciplinaryPoints: "fewest disciplinary points",
  alphabetical: "alphabetical order",
};

export function StandingsTable({
  rows,
  caption,
  compact = false,
}: {
  rows: StandingsRow[];
  caption: string;
  compact?: boolean;
}) {
  return (
    <div className="border-subtle overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-muted text-xs uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">
              #
            </th>
            <th scope="col" className="px-3 py-2 text-left">
              Team
            </th>
            <th scope="col" className="px-2 py-2 text-right" title="Played">
              P
            </th>
            <th scope="col" className="px-2 py-2 text-right" title="Won">
              W
            </th>
            <th scope="col" className="px-2 py-2 text-right" title="Drawn">
              D
            </th>
            <th scope="col" className="px-2 py-2 text-right" title="Lost">
              L
            </th>
            {compact ? null : (
              <>
                <th scope="col" className="px-2 py-2 text-right" title="Goals for">
                  GF
                </th>
                <th scope="col" className="px-2 py-2 text-right" title="Goals against">
                  GA
                </th>
              </>
            )}
            <th scope="col" className="px-2 py-2 text-right" title="Goal difference">
              GD
            </th>
            <th scope="col" className="px-2 py-2 text-right" title="Points">
              Pts
            </th>
            {compact ? null : (
              <th scope="col" className="px-3 py-2 text-left">
                Form
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-subtle border-t">
              <td className="text-muted px-3 py-2 tabular-nums">{row.rank}</td>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                <Link
                  href={`/teams/${row.teamId}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <TeamColorBar team={row} />
                  <span className="truncate">{row.teamName}</span>
                </Link>
                {row.separatedBy && row.separatedBy !== "points" ? (
                  <span className="text-muted block text-[10px]">
                    separated by {TIEBREAKER_LABELS[row.separatedBy] ?? row.separatedBy}
                  </span>
                ) : null}
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{row.played}</td>
              <td className="px-2 py-2 text-right tabular-nums">{row.won}</td>
              <td className="px-2 py-2 text-right tabular-nums">{row.drawn}</td>
              <td className="px-2 py-2 text-right tabular-nums">{row.lost}</td>
              {compact ? null : (
                <>
                  <td className="px-2 py-2 text-right tabular-nums">{row.goalsFor}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.goalsAgainst}</td>
                </>
              )}
              <td className="px-2 py-2 text-right tabular-nums">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="px-2 py-2 text-right font-bold tabular-nums">{row.points}</td>
              {compact ? null : (
                <td className="px-3 py-2">
                  <FormGuide form={row.form} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
