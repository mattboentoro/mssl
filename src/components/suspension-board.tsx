import { Badge, Card, EmptyState } from "@/components/ui";
import { SUSPENSION_REASON_LABELS } from "@/lib/enums";
import type { WarningBoardEntry } from "@/lib/queries";
import { playerKey, type ResolvedSuspension } from "@/lib/suspensions";

/** A ban, with the team name resolved for display. */
type SuspendedPlayer = ResolvedSuspension & { teamName: string };

/**
 * Who may not take the field in this fixture.
 *
 * Only players actually serving a ban appear. A referee checking this before
 * kickoff is answering one question -- can this player play -- and a list that
 * also carried everyone merely holding a card buried the answer among names
 * that needed no action.
 *
 * Season card counts ride along as the reason behind the ban rather than as a
 * score of their own, which is why each one is spelled out in words.
 */
export function SuspensionBoard({
  bans,
  cards,
  matchId,
  homeTeamName,
  awayTeamName,
}: {
  /** Bans landing on this fixture. */
  bans: SuspendedPlayer[];
  /** Season card totals, used to explain each ban. */
  cards: WarningBoardEntry[];
  /** The fixture being refereed, so each ban can say which game of it this is. */
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
}) {
  if (bans.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="Nobody is suspended"
          hint={`Every player at ${homeTeamName} and ${awayTeamName} is free to take the field.`}
        />
      </Card>
    );
  }

  const byPlayer = new Map(
    cards.map((entry) => [playerKey(entry.teamId, entry.playerName), entry]),
  );

  return (
    <Card className="divide-subtle divide-y">
      {bans.map((ban) => {
        const tally = byPlayer.get(playerKey(ban.teamId, ban.playerName));

        return (
          <div key={ban.id} className="bg-danger/10 flex flex-wrap items-center gap-3 p-3 text-sm">
            <span aria-hidden className="bg-danger h-6 w-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {ban.playerName}
                <span className="text-muted font-normal"> &middot; {ban.teamName}</span>
              </p>
              <p className="text-muted text-xs">
                {SUSPENSION_REASON_LABELS[ban.reason] ?? ban.reason}
                {` \u00b7 game ${ban.matchIds.indexOf(matchId) + 1} of ${ban.games}`}
              </p>
            </div>
            {tally && tally.yellow > 0 ? (
              <span className="text-muted flex shrink-0 items-center gap-1.5 text-xs">
                <span aria-hidden className="h-5 w-3.5 rounded-sm bg-yellow-400" />
                {tally.yellow === 1 ? "1 yellow card" : `${tally.yellow} yellow cards`}
              </span>
            ) : null}
            {tally && tally.red > 0 ? (
              <span className="text-muted flex shrink-0 items-center gap-1.5 text-xs">
                <span aria-hidden className="bg-danger h-5 w-3.5 rounded-sm" />
                {tally.red === 1 ? "1 red card" : `${tally.red} red cards`}
              </span>
            ) : null}
            <Badge tone="danger">Suspended</Badge>
          </div>
        );
      })}
    </Card>
  );
}
