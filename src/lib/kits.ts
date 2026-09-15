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

/**
 * The palette an administrator picks from.
 *
 * Deliberately a fixed list of basic, well-separated colours rather than a
 * free-form colour wheel: two teams choosing #c8102e and #c8112e helps nobody
 * on the touchline, and a named shortlist makes the clash check meaningful.
 * Ordered roughly around the colour wheel so the swatches read as a spectrum.
 */
export const KIT_PALETTE: readonly { name: string; hex: string }[] = [
  { name: "White", hex: "#ffffff" },
  { name: "Silver", hex: "#cbd5e1" },
  { name: "Grey", hex: "#64748b" },
  { name: "Black", hex: "#111111" },
  { name: "Red", hex: "#c8102e" },
  { name: "Maroon", hex: "#7f1d1d" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Yellow", hex: "#facc15" },
  { name: "Lime", hex: "#65a30d" },
  { name: "Green", hex: "#166534" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Sky", hex: "#0ea5e9" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Navy", hex: "#1e293b" },
  { name: "Purple", hex: "#6d28d9" },
  { name: "Pink", hex: "#db2777" },
  { name: "Brown", hex: "#78350f" },
];

/** The palette name for a hex, or a tidied-up hex when it predates the palette. */
export function kitColorName(hex: string): string {
  const normalized = normalizeHex(hex);
  return KIT_PALETTE.find((c) => c.hex === normalized)?.name ?? normalized.toUpperCase();
}

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
 * Choose the strips for a fixture without asking anyone.
 *
 * The home side always wears its first-choice kit — that is the convention the
 * league follows and what "the team's home crest" means. The away side only
 * changes when the two would be hard to tell apart from the touchline. If both
 * away options clash (two teams that own near-identical wardrobes) we keep
 * whichever is the lesser evil rather than silently picking the worse one.
 *
 * Pure, so the bulk importer and the unit tests agree by construction.
 */
export function pickKitsForFixture(
  home: TeamColors | undefined,
  away: TeamColors | undefined,
): { homeKit: "PRIMARY" | "ALTERNATE"; awayKit: "PRIMARY" | "ALTERNATE" } {
  if (!home || !away) return { homeKit: "PRIMARY", awayKit: "PRIMARY" };

  const homeShirt = resolveKit(home, "PRIMARY");
  const awayPrimary = resolveKit(away, "PRIMARY");
  if (!kitsClash(homeShirt, awayPrimary)) return { homeKit: "PRIMARY", awayKit: "PRIMARY" };

  const awayAlternate = resolveKit(away, "ALTERNATE");
  if (!kitsClash(homeShirt, awayAlternate)) return { homeKit: "PRIMARY", awayKit: "ALTERNATE" };

  const gapToAlternate = colorDistance(homeShirt, awayAlternate);
  const gapToPrimary = colorDistance(homeShirt, awayPrimary);
  return {
    homeKit: "PRIMARY",
    awayKit: gapToAlternate > gapToPrimary ? "ALTERNATE" : "PRIMARY",
  };
}

/**
 * Choose a first-choice and change strip for a brand-new club.
 *
 * A bulk import creates teams the league has never seen, so their colours have
 * to come from somewhere. Picking the palette entry that sits furthest from
 * every strip already worn nearby means an imported schedule does not quietly
 * fill a division with six shades of blue. `taken` is the set of colours
 * already in use — pass the division's existing strips.
 *
 * The change kit is then the colour furthest from the first choice, so a team
 * always has a usable second option. Pure and deterministic: the same inputs
 * give the same wardrobe every time, which is what makes it testable.
 */
export function pickKitsForNewTeam(taken: readonly string[]): {
  primary: string;
  alternate: string;
} {
  const used = taken.map(normalizeHex).filter(isHexColor);

  // Distance to the nearest already-worn strip. With nothing taken every
  // colour scores the same, so palette order breaks the tie and the first
  // imported club gets White.
  const farthestFrom = (from: readonly string[], exclude: string[] = []) => {
    let best = KIT_PALETTE[0].hex;
    let bestScore = -1;
    for (const entry of KIT_PALETTE) {
      if (exclude.includes(entry.hex)) continue;
      const score =
        from.length === 0 ? 0 : Math.min(...from.map((c) => colorDistance(entry.hex, c)));
      if (score > bestScore) {
        bestScore = score;
        best = entry.hex;
      }
    }
    return best;
  };

  const primary = farthestFrom(used);
  const alternate = farthestFrom([primary], [primary]);
  return { primary, alternate };
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
