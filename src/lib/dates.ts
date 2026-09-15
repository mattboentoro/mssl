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
