import { describe, expect, it } from "vitest";

import {
  WEEKDAY_HEADINGS,
  buildMonthGrid,
  monthLabel,
  parseMonthValue,
  shiftMonth,
  toMonthValue,
} from "@/lib/dates";

/**
 * The month grid drives the fixture calendar for referees and admins. It is
 * pure arithmetic, so it is worth pinning down the edges: leap years, the
 * Monday-first offset, and year rollover in both directions.
 */
describe("shiftMonth", () => {
  it("steps forward within a year", () => {
    expect(shiftMonth(2026, 3, 1)).toEqual({ year: 2026, month: 4, value: "2026-04" });
  });

  it("rolls over into the next year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1, value: "2027-01" });
  });

  it("rolls back into the previous year", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12, value: "2025-12" });
  });

  it("handles multi-month jumps in both directions", () => {
    expect(shiftMonth(2026, 2, 13).value).toBe("2027-03");
    expect(shiftMonth(2026, 2, -14).value).toBe("2024-12");
  });
});

describe("parseMonthValue", () => {
  const fallback = new Date("2026-05-20T12:00:00Z");

  it("reads a well-formed month", () => {
    expect(parseMonthValue("2026-02", fallback)).toEqual({ year: 2026, month: 2 });
  });

  it("falls back when the parameter is missing", () => {
    expect(parseMonthValue(undefined, fallback)).toEqual({ year: 2026, month: 5 });
  });

  it("rejects an out-of-range month rather than trusting it", () => {
    expect(parseMonthValue("2026-13", fallback)).toEqual({ year: 2026, month: 5 });
    expect(parseMonthValue("2026-00", fallback)).toEqual({ year: 2026, month: 5 });
  });

  it("rejects junk", () => {
    expect(parseMonthValue("nope", fallback)).toEqual({ year: 2026, month: 5 });
    expect(parseMonthValue("2026-2", fallback)).toEqual({ year: 2026, month: 5 });
  });

  it("round-trips with toMonthValue", () => {
    const value = toMonthValue(new Date("2026-02-14T20:00:00Z"));
    expect(value).toBe("2026-02");
    expect(parseMonthValue(value, fallback)).toEqual({ year: 2026, month: 2 });
  });
});

describe("buildMonthGrid", () => {
  const today = new Date("2026-02-14T20:00:00Z");

  it("always produces whole weeks", () => {
    for (let month = 1; month <= 12; month += 1) {
      const grid = buildMonthGrid(2026, month, today);
      expect(grid.length % 7).toBe(0);
    }
  });

  it("has one column per weekday heading", () => {
    expect(WEEKDAY_HEADINGS).toHaveLength(7);
  });

  it("pads the start so the first of the month lands on its real weekday", () => {
    // 1 February 2026 is a Sunday, so a Monday-first week needs six leading cells.
    const grid = buildMonthGrid(2026, 2, today);
    const leading = grid.findIndex((cell) => cell.inMonth);
    expect(leading).toBe(6);
    expect(grid[leading].key).toBe("2026-02-01");
  });

  it("borrows the tail of the previous month for the leading pad", () => {
    const grid = buildMonthGrid(2026, 2, today);
    expect(grid[0]).toMatchObject({ key: "2026-01-26", day: 26, inMonth: false });
    expect(grid[5]).toMatchObject({ key: "2026-01-31", day: 31, inMonth: false });
  });

  it("counts leap-year February correctly", () => {
    const leap = buildMonthGrid(2024, 2, today).filter((cell) => cell.inMonth);
    expect(leap).toHaveLength(29);
    const common = buildMonthGrid(2026, 2, today).filter((cell) => cell.inMonth);
    expect(common).toHaveLength(28);
  });

  it("counts the length of every month in a year", () => {
    const lengths = Array.from(
      { length: 12 },
      (_, i) => buildMonthGrid(2026, i + 1, today).filter((cell) => cell.inMonth).length,
    );
    expect(lengths).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it("rolls the trailing pad into the next year in December", () => {
    const grid = buildMonthGrid(2026, 12, today);
    const trailing = grid.filter((cell) => !cell.inMonth && cell.day < 15);
    expect(trailing.every((cell) => cell.key.startsWith("2027-01"))).toBe(true);
  });

  it("marks exactly one cell as today when today is in view", () => {
    const grid = buildMonthGrid(2026, 2, today);
    const marked = grid.filter((cell) => cell.isToday);
    expect(marked).toHaveLength(1);
    expect(marked[0].key).toBe("2026-02-14");
  });

  it("marks nothing when today is in a different month", () => {
    const grid = buildMonthGrid(2026, 7, today);
    expect(grid.some((cell) => cell.isToday)).toBe(false);
  });

  it("produces unique keys so fixtures group unambiguously", () => {
    const grid = buildMonthGrid(2026, 3, today);
    expect(new Set(grid.map((cell) => cell.key)).size).toBe(grid.length);
  });
});

describe("monthLabel", () => {
  it("names the month without needing an instant", () => {
    expect(monthLabel(2026, 2)).toBe("February 2026");
    expect(monthLabel(2026, 12)).toBe("December 2026");
  });
});
