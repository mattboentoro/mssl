import { describe, expect, it } from "vitest";

import { matchDisplayStatus, matchDisplayWhere } from "../src/lib/match-status";

const now = new Date("2025-03-15T20:00:00Z");
const past = new Date("2025-03-15T18:00:00Z");
const future = new Date("2025-03-15T22:00:00Z");

function at(overrides: Partial<Parameters<typeof matchDisplayStatus>[0]> = {}) {
  return matchDisplayStatus(
    { status: "SCHEDULED", refereeId: null, kickoffAt: future, hasResult: false, ...overrides },
    now,
  );
}

describe("matchDisplayStatus", () => {
  it("asks for a referee when nobody has claimed an upcoming fixture", () => {
    expect(at()).toBe("NEEDS_REFEREE");
  });

  it("says a claimed upcoming fixture has not started", () => {
    expect(at({ status: "ASSIGNED", refereeId: "ref-1" })).toBe("NOT_STARTED");
  });

  it("waits for the report once kick-off has passed", () => {
    expect(at({ status: "ASSIGNED", refereeId: "ref-1", kickoffAt: past })).toBe("WAITING_REPORT");
  });

  it("waits for the report even when nobody claimed the fixture", () => {
    expect(at({ kickoffAt: past })).toBe("WAITING_REPORT");
  });

  it("treats kick-off exactly now as under way", () => {
    expect(at({ kickoffAt: now })).toBe("WAITING_REPORT");
  });

  it("is completed as soon as a score exists", () => {
    expect(at({ status: "REPORT_SUBMITTED", kickoffAt: past, hasResult: true })).toBe("COMPLETED");
  });

  it("stays completed once the result is confirmed", () => {
    expect(at({ status: "CONFIRMED", kickoffAt: past, hasResult: true })).toBe("COMPLETED");
  });

  it("is completed when an admin files a score before kick-off", () => {
    expect(at({ status: "REPORT_SUBMITTED", hasResult: true })).toBe("COMPLETED");
  });

  it("shows a forfeit as completed, because the result is in", () => {
    expect(at({ status: "FORFEIT", kickoffAt: past, hasResult: true })).toBe("COMPLETED");
  });

  it("keeps a called-off fixture cancelled whatever the clock says", () => {
    expect(at({ status: "CANCELLED", kickoffAt: past })).toBe("CANCELLED");
    expect(at({ status: "CANCELLED", kickoffAt: past, hasResult: true })).toBe("CANCELLED");
  });

  it("keeps a postponed fixture postponed rather than chasing a report", () => {
    expect(at({ status: "POSTPONED", refereeId: "ref-1", kickoffAt: past })).toBe("POSTPONED");
  });

  it("accepts a serialised kick-off date", () => {
    expect(at({ kickoffAt: past.toISOString() })).toBe("WAITING_REPORT");
  });

  it("defaults to the real clock when no time is supplied", () => {
    expect(
      matchDisplayStatus({
        status: "SCHEDULED",
        refereeId: null,
        kickoffAt: new Date(Date.now() + 86_400_000),
        hasResult: false,
      }),
    ).toBe("NEEDS_REFEREE");
  });
});

describe("matchDisplayWhere", () => {
  it("matches a called-off fixture on the stored column alone", () => {
    expect(matchDisplayWhere("CANCELLED", now)).toEqual({ status: "CANCELLED" });
    expect(matchDisplayWhere("POSTPONED", now)).toEqual({ status: "POSTPONED" });
  });

  it("asks for a filed report and nothing about the clock", () => {
    expect(matchDisplayWhere("COMPLETED", now)).toEqual({
      status: { notIn: ["CANCELLED", "POSTPONED"] },
      report: { isNot: null },
    });
  });

  it("asks for a missing report after kick-off", () => {
    expect(matchDisplayWhere("WAITING_REPORT", now)).toEqual({
      status: { notIn: ["CANCELLED", "POSTPONED"] },
      report: { is: null },
      kickoffAt: { lte: now },
    });
  });

  it("splits the upcoming fixtures on the referee field", () => {
    expect(matchDisplayWhere("NOT_STARTED", now).refereeId).toEqual({ not: null });
    expect(matchDisplayWhere("NEEDS_REFEREE", now).refereeId).toBeNull();
  });

  it("keeps called-off fixtures out of every play-state bucket", () => {
    for (const bucket of ["COMPLETED", "WAITING_REPORT", "NOT_STARTED", "NEEDS_REFEREE"] as const) {
      expect(matchDisplayWhere(bucket, now).status).toEqual({
        notIn: ["CANCELLED", "POSTPONED"],
      });
    }
  });
});
