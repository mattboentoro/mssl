/**
 * Kit colours.
 *
 * Every team registers two colours — a primary and an alternate. A fixture
 * stores only *which* kit each side wears (`PRIMARY` / `ALTERNATE`), never the
 * hex value, so re-colouring a team automatically updates every fixture it
 * appears in.
 *
 * These helpers are pure and dependency-free so the clash rules can be unit
 * tested and reused from the Prisma seed script.
 */

export const DEFAULT_PRIMARY = "#0f766e";
export const DEFAULT_ALTERNATE = "#ffffff";

export interface TeamColors {
  colorPrimary?: string | null;
  colorAlternate?: string | null;
}

/** `#rgb` and `#rrggbb`, case-insensitive. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

/** Expand `#abc` to `#aabbcc` and lower-case it. Invalid input is returned as-is. */
export function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!HEX.test(trimmed)) return trimmed;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

/** The hex colour a team wears for a given kit choice, with safe fallbacks. */
export function resolveKit(team: TeamColors, choice: string): string {
  const primary = team.colorPrimary?.trim() || DEFAULT_PRIMARY;
  const alternate = team.colorAlternate?.trim() || DEFAULT_ALTERNATE;
  return choice === "ALTERNATE" ? alternate : primary;
}

function toRgb(hex: string): [number, number, number] {
  const full = normalizeHex(hex);
  if (!HEX.test(full)) return [0, 0, 0];
  return [
    parseInt(full.slice(1, 3), 16),
    parseInt(full.slice(3, 5), 16),
    parseInt(full.slice(5, 7), 16),
  ];
}

/**
 * Straight-line distance between two colours in RGB space, normalised to 0-1.
 * Crude next to a perceptual metric like CIEDE2000, but more than good enough
 * to flag "these two shirts look the same from the touchline".
 */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const delta = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  // The longest possible distance is black -> white.
  return delta / Math.sqrt(3 * 255 ** 2);
}

/** Below this the two kits are considered too similar to tell apart. */
export const CLASH_THRESHOLD = 0.25;

export function kitsClash(a: string, b: string): boolean {
  return colorDistance(a, b) < CLASH_THRESHOLD;
}

/**
 * Black or white, whichever stays readable on top of `hex`. Uses the WCAG
 * relative-luminance formula so mid-tones flip at the right point.
 */
export function readableTextOn(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = toRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}
