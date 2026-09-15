import { describe, expect, it } from "vitest";

import {
  CLASH_THRESHOLD,
  DEFAULT_ALTERNATE,
  DEFAULT_PRIMARY,
  KIT_PALETTE,
  colorDistance,
  isHexColor,
  kitColorName,
  kitsClash,
  normalizeHex,
  pickKitsForNewTeam,
  readableTextOn,
  resolveKit,
} from "@/lib/kits";

describe("KIT_PALETTE", () => {
  it("only holds normalised six-digit hex", () => {
    for (const { hex } of KIT_PALETTE) {
      expect(isHexColor(hex)).toBe(true);
      expect(normalizeHex(hex)).toBe(hex);
    }
  });

  it("has no duplicate colours or names", () => {
    expect(new Set(KIT_PALETTE.map((c) => c.hex)).size).toBe(KIT_PALETTE.length);
    expect(new Set(KIT_PALETTE.map((c) => c.name)).size).toBe(KIT_PALETTE.length);
  });

  it("offers both kit defaults, so an untouched team is still on-palette", () => {
    const hexes = KIT_PALETTE.map((c) => c.hex);
    expect(hexes).toContain(DEFAULT_PRIMARY);
    expect(hexes).toContain(DEFAULT_ALTERNATE);
  });
});

describe("kitColorName", () => {
  it("names a palette colour", () => {
    expect(kitColorName("#c8102e")).toBe("Red");
    expect(kitColorName("#0f766e")).toBe("Teal");
  });

  it("matches regardless of case or shorthand", () => {
    expect(kitColorName("#FFFFFF")).toBe("White");
    expect(kitColorName("#fff")).toBe("White");
  });

  it("falls back to the hex for a colour predating the palette", () => {
    expect(kitColorName("#123456")).toBe("#123456");
  });
});

describe("isHexColor", () => {
  it("accepts three- and six-digit hex, either case", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
    expect(isHexColor("  #0f766e  ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isHexColor("abc")).toBe(false);
    expect(isHexColor("#abcd")).toBe(false);
    expect(isHexColor("rgb(0,0,0)")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });
});

describe("normalizeHex", () => {
  it("expands shorthand to six digits", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#f00")).toBe("#ff0000");
  });

  it("lower-cases six-digit values and trims whitespace", () => {
    expect(normalizeHex("  #0F766E ")).toBe("#0f766e");
  });

  it("leaves invalid input alone so validation can report it", () => {
    expect(normalizeHex("nope")).toBe("nope");
  });
});

describe("resolveKit", () => {
  const team = { colorPrimary: "#123456", colorAlternate: "#fedcba" };

  it("returns the requested kit", () => {
    expect(resolveKit(team, "PRIMARY")).toBe("#123456");
    expect(resolveKit(team, "ALTERNATE")).toBe("#fedcba");
  });

  it("treats an unknown choice as the first-choice kit", () => {
    expect(resolveKit(team, "THIRD")).toBe("#123456");
  });

  it("falls back to the league defaults when a colour is missing", () => {
    expect(resolveKit({ colorPrimary: null, colorAlternate: "" }, "PRIMARY")).toBe(DEFAULT_PRIMARY);
    expect(resolveKit({ colorPrimary: "#123456" }, "ALTERNATE")).toBe(DEFAULT_ALTERNATE);
    expect(resolveKit({ colorPrimary: "   " }, "PRIMARY")).toBe(DEFAULT_PRIMARY);
  });
});

describe("colorDistance", () => {
  it("is 0 for identical colours regardless of notation", () => {
    expect(colorDistance("#ff0000", "#F00")).toBe(0);
  });

  it("is 1 for black against white", () => {
    expect(colorDistance("#000000", "#ffffff")).toBeCloseTo(1, 10);
  });

  it("is symmetric", () => {
    expect(colorDistance("#112233", "#445566")).toBeCloseTo(
      colorDistance("#445566", "#112233"),
      10,
    );
  });
});

describe("kitsClash", () => {
  it("flags two shirts that look the same from the touchline", () => {
    expect(kitsClash("#d40000", "#c81212")).toBe(true);
    expect(kitsClash("#ffffff", "#f8f8f8")).toBe(true);
  });

  it("clears genuinely contrasting shirts", () => {
    expect(kitsClash("#000000", "#ffffff")).toBe(false);
    expect(kitsClash("#0f766e", "#fbbf24")).toBe(false);
  });

  it("uses a strict comparison at the threshold so an exact-threshold pair passes", () => {
    // A pure-red channel gap that lands exactly on the threshold distance.
    const gap = Math.ceil(CLASH_THRESHOLD * Math.sqrt(3 * 255 ** 2));
    const hex = `#${gap.toString(16).padStart(2, "0")}0000`;
    expect(colorDistance("#000000", hex)).toBeGreaterThanOrEqual(CLASH_THRESHOLD);
    expect(kitsClash("#000000", hex)).toBe(false);
  });
});

describe("readableTextOn", () => {
  it("puts white text on dark kits", () => {
    expect(readableTextOn("#000000")).toBe("#ffffff");
    expect(readableTextOn("#0f766e")).toBe("#ffffff");
  });

  it("puts black text on light kits", () => {
    expect(readableTextOn("#ffffff")).toBe("#000000");
    expect(readableTextOn("#fbbf24")).toBe("#000000");
  });

  it("handles shorthand hex", () => {
    expect(readableTextOn("#fff")).toBe("#000000");
    expect(readableTextOn("#000")).toBe("#ffffff");
  });
});

describe("pickKitsForNewTeam", () => {
  it("always returns two different palette colours", () => {
    const kit = pickKitsForNewTeam([]);
    expect(isHexColor(kit.primary)).toBe(true);
    expect(isHexColor(kit.alternate)).toBe(true);
    expect(kit.primary).not.toBe(kit.alternate);
    expect(KIT_PALETTE.some((entry) => entry.hex === kit.primary)).toBe(true);
    expect(KIT_PALETTE.some((entry) => entry.hex === kit.alternate)).toBe(true);
  });

  it("gives a first kit that does not clash with its own change kit", () => {
    const kit = pickKitsForNewTeam([]);
    expect(kitsClash(kit.primary, kit.alternate)).toBe(false);
  });

  it("stays clear of the strips already worn in the division", () => {
    const taken = ["#ffffff", "#dc2626"];
    const kit = pickKitsForNewTeam(taken);
    for (const worn of taken) {
      expect(kitsClash(kit.primary, worn)).toBe(false);
    }
  });

  it("is deterministic, so a dry run shows what the import will commit", () => {
    const taken = ["#1d4ed8", "#16a34a"];
    expect(pickKitsForNewTeam(taken)).toEqual(pickKitsForNewTeam(taken));
  });

  it("ignores junk in the taken list rather than throwing", () => {
    const kit = pickKitsForNewTeam(["not a colour", "", "#1d4ed8"]);
    expect(isHexColor(kit.primary)).toBe(true);
    expect(kitsClash(kit.primary, "#1d4ed8")).toBe(false);
  });
});
