/**
 * League timezone.
 *
 * MSSL is run out of Redmond, WA, so every wall-clock time the league deals in
 * — kick-offs, CSV imports, calendar exports, admin forms — is Pacific time.
 * Nobody types an offset anywhere: a bare "2026-02-14 18:30" always means
 * 18:30 in Redmond, and the DST switch is handled for them.
 *
 * Deliberately zero-dependency. Node 22 and every browser we target ship full
 * ICU, so `Intl.DateTimeFormat` with an explicit `timeZone` gives identical
 * results on the server and in the client — which is what keeps React
 * hydration quiet. (`toLocaleString` without an explicit timeZone does not,
 * which is why the codebase used to render everything in UTC.)
 */

/** IANA zone for Redmond, WA. Handles PST/PDT automatically. */
export const LEAGUE_TIME_ZONE = "America/Los_Angeles";

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const abbrevFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEAGUE_TIME_ZONE,
  timeZoneName: "short",
});

/** Break an instant down into its Redmond wall-clock components. */
export function toZonedParts(instant: Date): ZonedParts {
  const lookup: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday] ?? 0,
  };
}

/**
 * Offset of the league zone at a given instant, in milliseconds.
 *
 * Negative west of Greenwich: -8h during PST, -7h during PDT.
 */
export function zoneOffsetMs(instant: Date): number {
  const p = toZonedParts(instant);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Strip sub-second noise so the subtraction is exact.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "PST" or "PDT" for the given instant. */
export function zoneAbbreviation(instant: Date): string {
  const part = abbrevFormatter.formatToParts(instant).find((p) => p.type === "timeZoneName");
  return part?.value ?? "PT";
}

/**
 * Turn Redmond wall-clock components into the real UTC instant.
 *
 * Two-pass, because the offset we need depends on the answer we are computing:
 * guess with the offset that applies at the naive instant, then re-measure at
 * the candidate answer and correct if we crossed a DST boundary.
 *
 * Ambiguous local times (the hour repeated when clocks go back) resolve to the
 * first occurrence; non-existent ones (the hour skipped in spring) roll
 * forward. Neither happens at 2am on a Sunday in a soccer fixture list.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstGuess = naive - zoneOffsetMs(new Date(naive));
  const settled = naive - zoneOffsetMs(new Date(firstGuess));
  return new Date(settled);
}

/** Matches an explicit UTC marker or numeric offset at the end of a string. */
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

const WALL_CLOCK =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(?:hrs?)?$/i;

/**
 * Parse a date/time that an organiser typed, interpreting it as Redmond time.
 *
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, `YYYY-MM-DD HH:mm` and the
 * seconds-bearing variants. A string that *does* carry an explicit `Z` or
 * `±HH:MM` is honoured as written — it is unambiguous, so there is nothing to
 * guess — which keeps older ISO exports importable.
 *
 * Returns `null` on anything it cannot read, so callers can report a row error
 * rather than silently storing an Invalid Date.
 */
export function parseLeagueDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (EXPLICIT_OFFSET.test(trimmed)) {
    const explicit = new Date(trimmed);
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }

  const match = WALL_CLOCK.exec(trimmed);
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const hour = h === undefined ? 0 : Number(h);
  const minute = mi === undefined ? 0 : Number(mi);
  const second = s === undefined ? 0 : Number(s);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const instant = zonedToUtc(year, month, day, hour, minute, second);
  // Reject rubbish like 2026-02-31, which Date.UTC would happily roll over.
  const back = toZonedParts(instant);
  if (back.day !== day || back.month !== month || back.year !== year) return null;
  return instant;
}
