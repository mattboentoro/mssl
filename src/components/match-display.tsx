import Link from "next/link";

import { KitSwatch, TeamColorBar } from "@/components/team-colors";
import { Badge, Card, FormGuide, MatchStatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { kitColorName, resolveKit } from "@/lib/kits";
import { displayedScore, type MatchListItem } from "@/lib/queries";
import { pointsPerGame, type PrimaryMetric, type StandingsRow } from "@/lib/standings";

/*
  Whether a fixture has a referee yet is league business, not fixture news, so
  the two statuses that only describe the assignment stay off the public card.
*/
const ASSIGNMENT_ONLY_STATUSES: readonly MatchListItem["status"][] = ["SCHEDULED", "ASSIGNED"];

type HeadToHeadTeam = {
  name: string;
  href?: string;
  forfeited?: boolean;
};

export function MatchDisclosureStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pb-2">
      <div
        aria-hidden
        className="bg-surface-muted border-subtle absolute inset-x-3 top-3 bottom-0 rounded-xl border shadow-sm"
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export function MatchDisclosureHint() {
  return (
    <span
      role="img"
      aria-label="Expand match details"
      className="bg-surface-muted border-subtle text-foreground mx-auto mt-3 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-transform group-open:rotate-180"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-3 w-3" fill="none">
        <path
          d="m5 7.5 5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function MatchScore({
  home,
  away,
  label = "Score",
}: {
  home: number;
  away: number;
  label?: string;
}) {
  return (
    <span
      className="bg-surface-muted border-subtle inline-flex items-center rounded-lg border px-5 py-2 text-xl font-bold tabular-nums shadow-sm"
      aria-label={`${label}: ${home} to ${away}`}
    >
      {home}
      <span className="text-muted mx-3" aria-hidden>
        &ndash;
      </span>
      {away}
    </span>
  );
}

export function MatchKitColors({
  homeTeam,
  awayTeam,
  homeKit,
  awayKit,
}: {
  homeTeam: MatchListItem["homeTeam"];
  awayTeam: MatchListItem["awayTeam"];
  homeKit: string;
  awayKit: string;
}) {
  const homeColor = resolveKit(homeTeam, homeKit);
  const awayColor = resolveKit(awayTeam, awayKit);

  return (
    <span
      className="bg-surface-muted border-subtle inline-flex items-center gap-3 rounded-lg border px-4 py-2 shadow-sm"
      aria-label={`${homeTeam.name} in ${kitColorName(homeColor)}, ${awayTeam.name} in ${kitColorName(awayColor)}`}
    >
      <span
        aria-hidden
        className="h-5 w-5 rounded-full ring-1 ring-black/20 dark:ring-white/25"
        style={{ backgroundColor: homeColor }}
      />
      <span className="text-muted text-xs font-semibold">vs</span>
      <span
        aria-hidden
        className="h-5 w-5 rounded-full ring-1 ring-black/20 dark:ring-white/25"
        style={{ backgroundColor: awayColor }}
      />
    </span>
  );
}

export function MatchHeadToHead({
  home,
  away,
  center,
  topLeft,
  topRight,
  time,
  status,
  location,
}: {
  home: HeadToHeadTeam;
  away: HeadToHeadTeam;
  center: React.ReactNode;
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  time?: React.ReactNode;
  status?: React.ReactNode;
  location?: React.ReactNode;
}) {
  const team = (side: HeadToHeadTeam, alignment: string) => {
    const content = (
      <>
        <span className="truncate">{side.name}</span>
        {side.forfeited ? (
          <span className="text-danger block text-[10px] font-semibold uppercase">Forfeit</span>
        ) : null}
      </>
    );
    return side.href ? (
      <Link href={side.href} className={`min-w-0 font-semibold hover:underline ${alignment}`}>
        {content}
      </Link>
    ) : (
      <span className={`min-w-0 font-semibold ${alignment}`}>{content}</span>
    );
  };

  return (
    <div>
      {topLeft || topRight ? (
        <div className="text-muted mb-3 flex items-center justify-between gap-3 text-xs font-semibold uppercase">
          <span>{topLeft}</span>
          <span>{topRight}</span>
        </div>
      ) : null}
      <div className="grid items-center gap-4 text-center sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-8">
        {team(home, "sm:text-right")}
        <div className="shrink-0">{center}</div>
        {team(away, "sm:text-left")}
      </div>
      {time || status || location ? (
        <div className="text-muted mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm font-medium">
          <span className="min-w-0 text-left">{time}</span>
          <span className="flex justify-center">{status}</span>
          <span className="min-w-0 text-right">{location}</span>
        </div>
      ) : null}
    </div>
  );
}

export function MatchRow({ match, action }: { match: MatchListItem; action?: React.ReactNode }) {
  const score = displayedScore(match.report);

  return (
    <Card as="li" className="p-4">
      <MatchHeadToHead
        home={{
          name: match.homeTeam.name,
          href: `/teams/${match.homeTeam.slug}`,
          forfeited: Boolean(match.report?.homeForfeit),
        }}
        away={{
          name: match.awayTeam.name,
          href: `/teams/${match.awayTeam.slug}`,
          forfeited: Boolean(match.report?.awayForfeit),
        }}
        center={
          score ? (
            <MatchScore home={score.home} away={score.away} />
          ) : (
            <MatchKitColors
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
              homeKit={match.homeKit}
              awayKit={match.awayKit}
            />
          )
        }
        topLeft={match.division.name}
        topRight={`MW ${match.matchweek}`}
        time={formatDateTime(match.kickoffAt)}
        status={
          <span className="flex flex-wrap justify-center gap-1">
            {ASSIGNMENT_ONLY_STATUSES.includes(match.status) ? null : (
              <MatchStatusBadge match={match} />
            )}
            {match.report?.status === "DISPUTED" ? <Badge tone="danger">Disputed</Badge> : null}
          </span>
        }
        location={<>&#128205; {match.venueName ?? "TBD"}</>}
      />
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function MatchList({
  matches,
  actions,
}: {
  matches: MatchListItem[];
  actions?: Record<string, React.ReactNode>;
}) {
  return (
    <ul className="grid gap-3">
      {matches.map((match) => (
        <MatchRow key={match.id} match={match} action={actions?.[match.id]} />
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
            <tr key={row.teamId} className="border-subtle border-t">
              <td className="text-muted px-3 py-2 tabular-nums">{row.rank}</td>
              <th scope="row" className="px-3 py-2 text-left font-medium">
                <Link
                  href={`/teams/${row.teamSlug}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <TeamColorBar team={row} />
                  <span className="truncate">{row.teamName}</span>
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
