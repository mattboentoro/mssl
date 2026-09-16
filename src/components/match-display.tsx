import Link from "next/link";

import { KitSwatch, TeamColorBar } from "@/components/team-colors";
import { Badge, Card, FormGuide, MatchStatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/dates";
import { kitColorName, resolveKit } from "@/lib/kits";
import { scoreText, type MatchListItem } from "@/lib/queries";
import { pointsPerGame, type PrimaryMetric, type StandingsRow } from "@/lib/standings";

/*
  Whether a fixture has a referee yet is league business, not fixture news, so
  the two statuses that only describe the assignment stay off the public card.
*/
const ASSIGNMENT_ONLY_STATUSES: readonly MatchListItem["status"][] = ["SCHEDULED", "ASSIGNED"];

export function MatchRow({ match }: { match: MatchListItem }) {
  const score = scoreText(match.report);

  return (
    <Card as="li" className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <time className="text-muted" dateTime={match.kickoffAt.toISOString()}>
          {formatDateTime(match.kickoffAt)}
        </time>
        <Badge tone="neutral">{match.division.name}</Badge>
        <Badge tone="neutral">MW {match.matchweek}</Badge>
        {ASSIGNMENT_ONLY_STATUSES.includes(match.status) ? null : (
          <MatchStatusBadge match={match} />
        )}
        {match.report?.status === "DISPUTED" ? <Badge tone="danger">Disputed</Badge> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <TeamCell
          team={match.homeTeam}
          kit={match.homeKit}
          forfeited={Boolean(match.report?.homeForfeit)}
        />
        {score ? (
          <span className="text-xl leading-5 font-bold tabular-nums">{score}</span>
        ) : (
          <span className="text-muted text-sm font-semibold">vs</span>
        )}
        <TeamCell
          team={match.awayTeam}
          kit={match.awayKit}
          forfeited={Boolean(match.report?.awayForfeit)}
        />
      </div>

      <div className="text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>Venue: {match.venueName || "TBD"}</span>
      </div>
    </Card>
  );
}

type TeamCellTeam = MatchListItem["homeTeam"];

function TeamCell({
  team,
  kit,
  forfeited = false,
}: {
  team: TeamCellTeam;
  kit: string;
  forfeited?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Link
        href={`/teams/${team.slug}`}
        className="flex min-w-0 items-center gap-1.5 text-left font-semibold hover:underline"
      >
        <KitSwatch team={team} kit={kit} teamName={team.name} />
        <span className="break-words">{team.name}</span>
      </Link>
      {/*
        The awarded scoreline is nobody's actual result, so the side that gave
        the fixture up is named beside the team rather than left for the reader
        to infer from a 3-0 nobody played.
      */}
      {forfeited ? (
        <span className="text-danger text-[10px] font-semibold uppercase">Forfeit</span>
      ) : null}
    </span>
  );
}

export function MatchList({
  matches,
  className,
}: {
  matches: MatchListItem[];
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-3", className)}>
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} />
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
  primaryMetric = "points",
}: {
  rows: StandingsRow[];
  caption: string;
  compact?: boolean;
  primaryMetric?: PrimaryMetric;
}) {
  // When the season ranks on points per game, the number doing the ranking has
  // to be on screen -- otherwise the order looks arbitrary to anyone reading
  // the points column and finding it out of sequence.
  const showPpg = primaryMetric === "pointsPerGame";
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "data-table w-full text-sm",
          compact ? "standings-table-compact min-w-[20rem]" : "min-w-[36rem]",
        )}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="text-muted text-xs uppercase">
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
            {showPpg ? (
              <th scope="col" className="px-2 py-2 text-right" title="Points per game">
                PPG
              </th>
            ) : null}
            {compact ? null : (
              <th scope="col" className="px-3 py-2 text-left">
                Form
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId}>
              <td className="text-muted px-3 py-3 tabular-nums">{row.rank}</td>
              <th scope="row" className="px-3 py-3 text-left font-medium">
                <Link
                  href={`/teams/${row.teamSlug}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <TeamColorBar team={row} />
                  <span>{row.teamName}</span>
                </Link>
                {/*
                  A tiebreaker note only tells the reader something they cannot
                  already see. The season's ranking metric has its own visible
                  column, so naming it here just repeats the number next to it.
                */}
                {row.separatedBy &&
                row.separatedBy !== "points" &&
                row.separatedBy !== primaryMetric ? (
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
              {showPpg ? (
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {pointsPerGame(row).toFixed(2)}
                </td>
              ) : null}
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
