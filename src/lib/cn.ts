/** Tiny classnames helper — avoids pulling in `clsx` for a one-liner. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
