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

/** `YYYY-MM-DD`, with the rest of the string handed to {@link parseClock}. */
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]+(.+))?$/;

/** `M/D/YYYY` and friends — what Excel writes and what organisers type. */
const US_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[T, ]+(.+))?$/;

/** `HH:mm`, `H:mm:ss`, either optionally followed by `am`/`pm`. */
const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\s*(?:hrs?)?$/i;

/** Read the time half of a stamp. A missing time means midnight, not an error. */
function parseClock(value: string | undefined) {
  if (value === undefined) return { hour: 0, minute: 0, second: 0 };

  const match = CLOCK.exec(value.trim());
  if (!match) return null;

  const [, h, mi, s, meridiem] = match;
  let hour = Number(h);
  const minute = Number(mi);
  const second = s === undefined ? 0 : Number(s);

  if (meridiem) {
    // 12-hour input: 12am is midnight and 12pm is noon, everything else shifts.
    if (hour < 1 || hour > 12) return null;
    if (meridiem.toLowerCase() === "pm") hour = hour === 12 ? 12 : hour + 12;
    else hour = hour === 12 ? 0 : hour;
  }

  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

/**
 * Parse a date/time that an organiser typed, interpreting it as Redmond time.
 *
 * Accepts the ISO shapes (`YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, `…THH:mm:ss`) and
 * the US shapes Excel produces when it rewrites a CSV (`M/D/YYYY HH:mm`,
 * `8/5/26 5:30 pm`). Slash dates are read month-first because the league runs
 * on Redmond time, so `8/5/2026` is 5 August. A string that *does* carry an
 * explicit `Z` or `±HH:MM` is honoured as written — it is unambiguous, so
 * there is nothing to guess — which keeps older ISO exports importable.
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

  const iso = ISO_DATE.exec(trimmed);
  const us = iso ? null : US_DATE.exec(trimmed);

  let year: number;
  let month: number;
  let day: number;
  let rest: string | undefined;

  if (iso) {
    [year, month, day, rest] = [Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4]];
  } else if (us) {
    [month, day, rest] = [Number(us[1]), Number(us[2]), us[4]];
    year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const clock = parseClock(rest);
  if (!clock) return null;

  const instant = zonedToUtc(year, month, day, clock.hour, clock.minute, clock.second);
  // Reject rubbish like 2026-02-31, which Date.UTC would happily roll over.
  const back = toZonedParts(instant);
  if (back.day !== day || back.month !== month || back.year !== year) return null;
  return instant;
}
