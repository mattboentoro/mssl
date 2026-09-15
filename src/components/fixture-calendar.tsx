import Link from "next/link";

import { KitSwatch } from "@/components/team-colors";
import { Card } from "@/components/ui";
import {
  WEEKDAY_HEADINGS,
  buildMonthGrid,
  formatTime,
  monthLabel,
  shiftMonth,
  toDateInputValue,
} from "@/lib/dates";
import type { MatchListItem } from "@/lib/queries";

/**
 * Month view of a fixture list.
 *
 * Referees and admins both think in weekends rather than in a flat ordered
 * list, so the same fixtures are offered as a grid as well. Rendering is
 * entirely server-side: month navigation is plain links carrying a `month`
 * query parameter, which keeps the view shareable, back-button friendly and
 * usable without JavaScript.
 *
 * Every date is league time (Redmond), matching the rest of the site, so a
 * 19:00 Sunday kickoff never drifts into Monday for a viewer in another zone.
 */
export function FixtureCalendar({
  matches,
  year,
  month,
  basePath,
  query,
  hrefForMatch,
  monthParam = "month",
  emptyHint,
}: {
  matches: MatchListItem[];
  year: number;
  month: number;
  /** Page the navigation links point back at, e.g. "/referee". */
  basePath: string;
  /** Other query parameters to preserve across month navigation. */
  query?: Record<string, string | undefined>;
  /** Where a fixture chip links to. Return undefined to render plain text. */
  hrefForMatch?: (match: MatchListItem) => string | undefined;
  monthParam?: string;
  emptyHint?: string;
}) {
  const grid = buildMonthGrid(year, month);

  const byDay = new Map<string, MatchListItem[]>();
  for (const match of matches) {
    const key = toDateInputValue(match.kickoffAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(match);
    else byDay.set(key, [match]);
  }

  const linkTo = (value: string) => {
    const params = new URLSearchParams();
    for (const [key, entry] of Object.entries(query ?? {})) {
      if (entry) params.set(key, entry);
    }
    params.set(monthParam, value);
    return `${basePath}?${params.toString()}`;
  };

  const previous = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const label = monthLabel(year, month);
  const navClass =
    "border-subtle hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm font-medium";

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold" aria-live="polite">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          <Link href={linkTo(previous.value)} className={navClass} rel="prev">
            <span aria-hidden="true">&larr;</span>
            <span className="sr-only">
              Previous month, {monthLabel(previous.year, previous.month)}
            </span>
          </Link>
          <Link href={linkTo(next.value)} className={navClass} rel="next">
            <span aria-hidden="true">&rarr;</span>
            <span className="sr-only">Next month, {monthLabel(next.year, next.month)}</span>
          </Link>
        </div>
      </div>

      {/*
        A calendar is tabular data, so it is marked up as a table: screen
        readers then announce "Saturday" with each cell rather than leaving the
        user to infer the column.
      */}
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <caption className="sr-only">Fixtures for {label}, shown in Redmond time</caption>
          <thead>
            <tr>
              {WEEKDAY_HEADINGS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="text-muted pb-2 text-center text-xs font-medium tracking-wide uppercase"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunk(grid, 7).map((week) => (
              <tr key={week[0]!.key}>
                {week.map((cell) => {
                  const dayMatches = cell.inMonth ? (byDay.get(cell.key) ?? []) : [];
                  return (
                    <td
                      key={cell.key}
                      className={[
                        "border-subtle h-24 border p-1 align-top",
                        cell.inMonth ? "" : "bg-surface-muted/40",
                        cell.isToday ? "outline-brand outline-2 -outline-offset-2" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span
                        className={[
                          "block text-right text-xs tabular-nums",
                          cell.inMonth ? "text-muted" : "text-muted/50",
                          cell.isToday ? "text-brand font-bold" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {cell.isToday ? <span className="sr-only">Today, </span> : null}
                        {cell.day}
                      </span>

                      {dayMatches.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {dayMatches.map((match) => (
                            <li key={match.id}>
                              <FixtureChip match={match} href={hrefForMatch?.(match)} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matches.length === 0 ? (
        <p className="text-muted mt-3 text-xs">{emptyHint ?? "No fixtures fall in this month."}</p>
      ) : (
        <p className="text-muted mt-3 text-xs">
          {matches.length} fixture{matches.length === 1 ? "" : "s"} shown, in Redmond time.
        </p>
      )}
    </Card>
  );
}

function FixtureChip({ match, href }: { match: MatchListItem; href?: string }) {
  const label = `${match.homeTeam.shortName} v ${match.awayTeam.shortName}`;
  const detail = `${formatTime(match.kickoffAt)} ${label}`;

  const body = (
    <>
      <span className="tabular-nums">{formatTime(match.kickoffAt)}</span>
      <KitSwatch team={match.homeTeam} kit={match.homeKit} teamName={match.homeTeam.name} />
      <span className="truncate">{label}</span>
    </>
  );

  const shared =
    "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight";

  if (!href) {
    return (
      <span className={`${shared} bg-surface-muted`} title={detail}>
        {body}
      </span>
    );
  }

  return (
    <Link href={href} className={`${shared} bg-surface-muted hover:bg-brand/10`} title={detail}>
      {body}
    </Link>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * List/calendar switch.
 *
 * Plain links rather than a client component: the view is a query parameter, so
 * it survives a refresh, can be bookmarked, and needs no JavaScript.
 */
export function CalendarViewToggle({
  view,
  basePath,
  query,
  param = "view",
}: {
  view: "list" | "calendar";
  basePath: string;
  query?: Record<string, string | undefined>;
  param?: string;
}) {
  const linkTo = (value: string) => {
    const params = new URLSearchParams();
    for (const [key, entry] of Object.entries(query ?? {})) {
      if (entry) params.set(key, entry);
    }
    params.set(param, value);
    return `${basePath}?${params.toString()}`;
  };

  const options: { value: "list" | "calendar"; label: string }[] = [
    { value: "list", label: "List" },
    { value: "calendar", label: "Calendar" },
  ];

  return (
    <div className="border-subtle inline-flex rounded-lg border p-0.5" role="group">
      {options.map((option) => {
        const current = option.value === view;
        return (
          <Link
            key={option.value}
            href={linkTo(option.value)}
            aria-current={current ? "true" : undefined}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              current ? "bg-brand text-brand-contrast" : "text-muted hover:bg-surface-muted"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Read a `view` query parameter, defaulting to the list. */
export function parseView(value: string | undefined): "list" | "calendar" {
  return value === "calendar" ? "calendar" : "list";
}
