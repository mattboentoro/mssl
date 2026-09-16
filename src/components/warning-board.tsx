import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { SUSPENSION_REASON_LABELS } from "@/lib/enums";
import type { WarningBoardEntry } from "@/lib/queries";
import { isOneCautionFromBan, playerKey, type ResolvedSuspension } from "@/lib/suspensions";

/**
 * Pre-match briefing for the referee holding the fixture: who on either team is
 * already carrying cards this season, and any league sanction an administrator
 * has issued against them. Sanctions sort to the top because they are the ones
 * the referee is most likely to have to act on.
 */
export function WarningBoard({
  entries,
  homeTeamName,
  awayTeamName,
  bans = [],
}: {
  entries: WarningBoardEntry[];
  homeTeamName: string;
  awayTeamName: string;
  /** Bans that land on this fixture, so the board can flag who may not play. */
  bans?: ResolvedSuspension[];
}) {
  const sanctioned = entries.filter((entry) => entry.sanctions.length > 0);
  const banned = new Map(bans.map((ban) => [playerKey(ban.teamId, ban.playerName), ban]));

  if (entries.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          title="Clean sheet"
          hint={`Nobody at ${homeTeamName} or ${awayTeamName} is carrying a card this season.`}
        />
      </Card>
    );
  }

  // A player who may not take the field outranks one who is merely in the book,
  // so re-order the board around today's bans before rendering it.
  const ordered = [...entries].sort(
    (a, b) =>
      Number(banned.has(playerKey(b.teamId, b.playerName))) -
      Number(banned.has(playerKey(a.teamId, a.playerName))),
  );

  return (
    <Card className="overflow-hidden">
      {sanctioned.length > 0 ? (
        <div className="border-subtle bg-danger/10 border-b p-4">
          <p className="text-sm font-semibold">
            {`${sanctioned.length} league ${sanctioned.length === 1 ? "sanction" : "sanctions"} in force`}
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {sanctioned.map((entry) => (
              <li key={`${entry.teamId}-${entry.playerName}`}>
                <span className="font-medium">{entry.playerName}</span>
                <span className="text-muted"> &middot; {entry.teamName}</span>
                {entry.sanctions.map((sanction) => (
                  <p key={sanction.id} className="text-muted text-xs">
                    {sanction.type === "RED" ? "Red card" : "Yellow card"} issued by the league on{" "}
                    {formatDate(sanction.createdAt)}
                    {sanction.note ? ` \u2014 ${sanction.note}` : ""}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="divide-subtle divide-y">
        {ordered.map((entry) => {
          const ban = banned.get(playerKey(entry.teamId, entry.playerName));
          // One more caution tips them over the accumulation threshold. Worth
          // saying out loud: the referee is the one who decides whether it lands.
          const onTheBrink = !ban && isOneCautionFromBan(entry.yellow);

          return (
            <li
              key={`${entry.teamId}-${entry.playerName}`}
              className={`flex flex-wrap items-center gap-3 p-3 text-sm ${ban ? "bg-danger/10" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{entry.playerName}</span>
                <span className="text-muted"> &middot; {entry.teamName}</span>
              </span>
              {entry.yellow > 0 ? (
                <span className="flex shrink-0 items-center gap-1">
                  <span aria-hidden className="h-5 w-3.5 rounded-sm bg-yellow-400" />
                  <span className="text-xs tabular-nums">
                    <span className="sr-only">yellow cards: </span>
                    {entry.yellow}
                  </span>
                </span>
              ) : null}
              {entry.red > 0 ? (
                <span className="flex shrink-0 items-center gap-1">
                  <span aria-hidden className="bg-danger h-5 w-3.5 rounded-sm" />
                  <span className="text-xs tabular-nums">
                    <span className="sr-only">red cards: </span>
                    {entry.red}
                  </span>
                </span>
              ) : null}
              {ban ? (
                <Badge tone="danger">
                  {`Suspended \u00b7 ${SUSPENSION_REASON_LABELS[ban.reason] ?? ban.reason}`}
                </Badge>
              ) : onTheBrink ? (
                <Badge tone="warning">One caution from a ban</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
