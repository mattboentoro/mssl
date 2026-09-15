/**
 * Matchweek labels are free text so a season can hold "1".."14" alongside
 * "Final" and "Cup R1". Plain string sorting would put "10" before "2", so
 * anything that looks like a number sorts numerically and ahead of the rest,
 * which keeps a knockout stage at the end of the list where it belongs.
 */
export function compareMatchweeks(a: string, b: string): number {
  const na = Number(a.trim());
  const nb = Number(b.trim());
  const aNumeric = a.trim() !== "" && Number.isFinite(na);
  const bNumeric = b.trim() !== "" && Number.isFinite(nb);

  if (aNumeric && bNumeric) return na - nb;
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a.localeCompare(b, "en", { sensitivity: "base" });
}
