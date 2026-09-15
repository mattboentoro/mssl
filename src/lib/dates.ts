/**
 * Date/time formatting helpers.
 *
 * Everything renders in league time (Redmond, WA) using an explicit IANA zone,
 * so server and client markup match and React hydration stays quiet. See
 * `src/lib/timezone.ts` for the zone machinery.
 */

import { toZonedParts, zoneAbbreviation, type ZonedParts } from "@/lib/timezone";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (value: number) => String(value).padStart(2, "0");

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

const partsOf = (value: Date | string): ZonedParts => toZonedParts(toDate(value));

/** e.g. "Sat 14 Feb" */
export function formatDate(value: Date | string): string {
  const p = partsOf(value);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** e.g. "Sat 14 Feb 2026" */
export function formatLongDate(value: Date | string): string {
  const p = partsOf(value);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** e.g. "18:30", in league time. */
export function formatTime(value: Date | string): string {
  const p = partsOf(value);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** e.g. "Sat 14 Feb 2026 · 18:30 PST" */
export function formatDateTime(value: Date | string): string {
  const d = toDate(value);
  return `${formatLongDate(d)} \u00b7 ${formatTime(d)} ${zoneAbbreviation(d)}`;
}

/** e.g. "February 2026" — month headings on the fixture calendar. */
export function formatMonthYear(value: Date | string): string {
  const p = partsOf(value);
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** `YYYY-MM-DD` in league time, used for `<input type="date">` and grouping. */
export function toDateInputValue(value: Date | string): string {
  const p = partsOf(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DDTHH:mm` in league time, used for `<input type="datetime-local">`. */
export function toDateTimeInputValue(value: Date | string): string {
  const d = toDate(value);
  return `${toDateInputValue(d)}T${formatTime(d)}`;
}

/* -------------------------------------------------------------------------- */
/* Month grid                                                                 */
/* -------------------------------------------------------------------------- */

/** A single cell in the fixture calendar. */
export interface CalendarDay {
  /** `YYYY-MM-DD` in league time — the key fixtures are grouped under. */
  key: string;
  /** Day of the month, 1-31. */
  day: number;
  /** False for the leading/trailing days borrowed from the neighbouring month. */
  inMonth: boolean;
  /** True when this cell is today in league time. */
  isToday: boolean;
}

/** `YYYY-MM`, the value the calendar uses to address a month. */
export function toMonthValue(value: Date | string): string {
  const p = partsOf(value);
  return `${p.year}-${pad(p.month)}`;
}

/**
 * Read a `YYYY-MM` month parameter, falling back to the month containing
 * `fallback` when it is missing or malformed.
 */
export function parseMonthValue(
  value: string | undefined,
  fallback: Date = new Date(),
): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  const p = partsOf(fallback);
  return { year: p.year, month: p.month };
}

/** Step a `YYYY-MM` pair by whole months, rolling the year over. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number; value: string } {
  const zeroBased = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return { year: nextYear, month: nextMonth, value: `${nextYear}-${pad(nextMonth)}` };
}

/** e.g. "February 2026" for a `YYYY-MM` pair, without needing an instant. */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Number of days in a month, leap years included. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Day of the week (0 = Sunday) that a given league-time date falls on. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Build the 7-column grid for a month, padded with the neighbouring months'
 * days so every row is full. Weeks start on Sunday, matching how the league
 * reads a weekend fixture list.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  today: Date = new Date(),
): CalendarDay[] {
  const todayKey = toDateInputValue(today);
  const cells: CalendarDay[] = [];

  const push = (y: number, m: number, d: number, inMonth: boolean) => {
    const key = `${y}-${pad(m)}-${pad(d)}`;
    cells.push({ key, day: d, inMonth, isToday: key === todayKey });
  };

  // Sunday-first, so `weekdayOf` (0 = Sunday) is already the column index.
  const leading = weekdayOf(year, month, 1);
  if (leading > 0) {
    const prev = shiftMonth(year, month, -1);
    const prevLength = daysInMonth(prev.year, prev.month);
    for (let i = leading; i > 0; i -= 1) {
      push(prev.year, prev.month, prevLength - i + 1, false);
    }
  }

  const length = daysInMonth(year, month);
  for (let day = 1; day <= length; day += 1) push(year, month, day, true);

  const next = shiftMonth(year, month, 1);
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    push(next.year, next.month, trailing, false);
    trailing += 1;
  }

  return cells;
}

/** Column headings for `buildMonthGrid`, in the same Sunday-first order. */
export const WEEKDAY_HEADINGS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "in 3 days" / "2 hours ago" — coarse and deterministic. */
export function relativeTime(value: Date | string, now: Date = new Date()): string {
  const diffMs = toDate(value).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const render = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ${diffMs >= 0 ? "from now" : "ago"}`;

  if (abs < minute) return "just now";
  if (abs < hour) return render(Math.round(abs / minute), "minute");
  if (abs < day) return render(Math.round(abs / hour), "hour");
  return render(Math.round(abs / day), "day");
}
