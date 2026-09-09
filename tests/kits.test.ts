import { describe, expect, it } from "vitest";

import {
  CLASH_THRESHOLD,
  DEFAULT_ALTERNATE,
  DEFAULT_PRIMARY,
  colorDistance,
  isHexColor,
  kitsClash,
  normalizeHex,
  readableTextOn,
  resolveKit,
} from "@/lib/kits";

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
