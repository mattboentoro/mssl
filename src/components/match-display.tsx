import Link from "next/link";

import { KitSwatch, TeamColorBar } from "@/components/team-colors";
import { Badge, Card, FormGuide, MatchStatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { kitColorName, resolveKit } from "@/lib/kits";
import type { MatchListItem } from "@/lib/queries";
import type { StandingsRow } from "@/lib/standings";

/** Score if a report exists, otherwise the kickoff time. */
function scoreLabel(match: MatchListItem): string | null {
  if (!match.report) return null;
  return `${match.report.homeScore} \u2013 ${match.report.awayScore}`;
}

export function MatchRow({
  match,
  showReferee = false,
}: {
  match: MatchListItem;
  showReferee?: boolean;
}) {
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
        {/*
          Who is refereeing is league business, not public information — the
          caller decides, so this component never has to reach for the session.
        */}
        {showReferee ? (
          <span>&#128100; {match.referee ? match.referee.name : <em>Referee needed</em>}</span>
        ) : null}
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

export function MatchList({
  matches,
  showReferee = false,
}: {
  matches: MatchListItem[];
  showReferee?: boolean;
}) {
  return (
    <ul className="grid gap-3">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} showReferee={showReferee} />
      ))}
    </ul>
  );
}

/**
 * One fixture written as a single line: "&#9679; Home (black) v &#9679; Away (red)".
 *
 * Referee screens previously carried the kit colours on their own row below the
 * fixture, which repeated both team names. Naming the colour beside the team it
 * belongs to says the same thing in half the space, and a swatch on its own is
 * hard to read on a phone in daylight.
 */
export function FixtureLine({
  match,
  href,
  className = "",
}: {
  match: MatchListItem;
  /** Where the fixture name points. Omit to render plain text. */
  href?: string;
  className?: string;
}) {
  const sides = [
    { team: match.homeTeam, kit: match.homeKit },
    { team: match.awayTeam, kit: match.awayKit },
  ];

  const body = (
    <>
      {sides.map(({ team, kit }, index) => (
        <span key={team.id} className="inline-flex items-center gap-1.5">
          {index === 1 ? <span className="text-muted mr-1 text-xs font-normal">v</span> : null}
          <KitSwatch team={team} kit={kit} teamName={team.name} />
          {/*
            One interpolation so the name and its colour stay a single text
            node — React separates adjacent JSX text with an HTML comment.
          */}
          <span>{`${team.name} (${kitColorName(resolveKit(team, kit)).toLowerCase()})`}</span>
        </span>
      ))}
    </>
  );

  const shell = `inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold ${className}`;

  return href ? (
    <Link href={href} className={`${shell} hover:underline`}>
      {body}
    </Link>
  ) : (
    <p className={shell}>{body}</p>
  );
}

/* -------------------------------------------------------------------------- */
/* Standings table                                                            */
/* -------------------------------------------------------------------------- */

const TIEBREAKER_LABELS: Record<string, string> = {
  points: "points",
  pointsPerGame: "points per game",
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
              <td className="px-2 py-2 text-right font-bold tabular-nums">
                {row.points}
                {row.pointsAdjustment !== 0 ? (
                  <span
                    className="text-muted ml-1 text-[10px] font-semibold"
                    title={`Includes an administrative adjustment of ${row.pointsAdjustment > 0 ? "+" : ""}${row.pointsAdjustment} point(s).`}
                  >
                    {row.pointsAdjustment > 0 ? "+" : "−"}
                    {Math.abs(row.pointsAdjustment)}
                    <span className="sr-only">
                      {" "}
                      point adjustment applied by the league administrator
                    </span>
                  </span>
                ) : null}
              </td>
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
