import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { WarningBoardEntry } from "@/lib/queries";

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
}: {
  entries: WarningBoardEntry[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  const sanctioned = entries.filter((entry) => entry.sanctions.length > 0);

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
        {entries.map((entry) => (
          <li
            key={`${entry.teamId}-${entry.playerName}`}
            className="flex flex-wrap items-center gap-3 p-3 text-sm"
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
            <Badge tone={entry.red > 0 ? "danger" : entry.points >= 3 ? "warning" : "neutral"}>
              {`${entry.points} ${entry.points === 1 ? "pt" : "pts"}`}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
