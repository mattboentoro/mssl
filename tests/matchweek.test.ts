/**
 * Matchweek labels became free text so an organiser can schedule a "Final"
 * alongside matchweek 14. These tests pin the ordering rule, because plain
 * string sorting silently puts week 10 before week 2 and nobody notices until
 * the schedule page is already wrong.
 */
import { describe, expect, it } from "vitest";

import { compareMatchweeks } from "@/lib/matchweek";

describe("compareMatchweeks", () => {
  it("sorts numeric labels numerically, not alphabetically", () => {
    const sorted = ["10", "2", "1", "14", "3"].sort(compareMatchweeks);
    expect(sorted).toEqual(["1", "2", "3", "10", "14"]);
  });

  it("keeps knockout rounds after the regular season", () => {
    const sorted = ["Final", "3", "Semi-final", "1", "10"].sort(compareMatchweeks);
    expect(sorted).toEqual(["1", "3", "10", "Final", "Semi-final"]);
  });

  it("sorts non-numeric labels alphabetically among themselves", () => {
    const sorted = ["Quarter-final", "Cup R1", "Final"].sort(compareMatchweeks);
    expect(sorted).toEqual(["Cup R1", "Final", "Quarter-final"]);
  });

  it("ignores surrounding whitespace when deciding what looks numeric", () => {
    expect(compareMatchweeks(" 2 ", "10")).toBeLessThan(0);
  });

  it("treats a blank label as text so it never poses as week zero", () => {
    expect(compareMatchweeks("", "1")).toBeGreaterThan(0);
  });
});
