/**
 * Date/time formatting helpers.
 *
 * Everything renders in a fixed timezone-free, locale-stable format so server
 * and client markup match (React hydration is picky about `toLocaleString`).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (value: number) => String(value).padStart(2, "0");

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/** e.g. "Sat 14 Feb" */
export function formatDate(value: Date | string): string {
  const d = toDate(value);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** e.g. "Sat 14 Feb 2026" */
export function formatLongDate(value: Date | string): string {
  const d = toDate(value);
  return `${formatDate(d)} ${d.getUTCFullYear()}`;
}

/** e.g. "18:30" (UTC) */
export function formatTime(value: Date | string): string {
  const d = toDate(value);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** e.g. "Sat 14 Feb 2026 · 18:30 UTC" */
export function formatDateTime(value: Date | string): string {
  return `${formatLongDate(value)} \u00b7 ${formatTime(value)} UTC`;
}

/** `YYYY-MM-DD`, used for `<input type="date">` and grouping. */
export function toDateInputValue(value: Date | string): string {
  const d = toDate(value);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `YYYY-MM-DDTHH:mm`, used for `<input type="datetime-local">`. */
export function toDateTimeInputValue(value: Date | string): string {
  return `${toDateInputValue(value)}T${formatTime(value)}`;
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
