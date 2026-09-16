import { describe, expect, it } from "vitest";

import { isForfeit, matchDisplayStatus, matchDisplayWhere } from "../src/lib/match-status";

const now = new Date("2025-03-15T20:00:00Z");
const past = new Date("2025-03-15T18:00:00Z");
const future = new Date("2025-03-15T22:00:00Z");

const PLAYED = { homeForfeit: false, awayForfeit: false };

function at(overrides: Partial<Parameters<typeof matchDisplayStatus>[0]> = {}) {
  return matchDisplayStatus(
    { status: "SCHEDULED", refereeId: null, kickoffAt: future, report: null, ...overrides },
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
    expect(at({ status: "REPORT_SUBMITTED", kickoffAt: past, report: PLAYED })).toBe("COMPLETED");
  });

  it("stays completed once the result is confirmed", () => {
    expect(at({ status: "CONFIRMED", kickoffAt: past, report: PLAYED })).toBe("COMPLETED");
  });

  it("is completed when an admin files a score before kick-off", () => {
    expect(at({ status: "REPORT_SUBMITTED", report: PLAYED })).toBe("COMPLETED");
  });

  it("calls out a forfeit rather than passing it off as a played result", () => {
    expect(
      at({
        status: "FORFEIT",
        kickoffAt: past,
        report: { homeForfeit: false, awayForfeit: true },
      }),
    ).toBe("FORFEITED");
  });

  it("calls out a forfeit whichever side gave the match up", () => {
    expect(at({ kickoffAt: past, report: { homeForfeit: true, awayForfeit: false } })).toBe(
      "FORFEITED",
    );
    expect(at({ kickoffAt: past, report: { homeForfeit: true, awayForfeit: true } })).toBe(
      "FORFEITED",
    );
  });

  /*
    The stored column is not the authority here: an admin override files the
    forfeit flags without necessarily moving the status to FORFEIT.
  */
  it("reads the forfeit off the report, not the stored status", () => {
    expect(
      at({ status: "CONFIRMED", kickoffAt: past, report: { ...PLAYED, awayForfeit: true } }),
    ).toBe("FORFEITED");
  });

  it("keeps a called-off fixture cancelled whatever the clock or the report says", () => {
    expect(at({ status: "CANCELLED", kickoffAt: past })).toBe("CANCELLED");
    expect(at({ status: "CANCELLED", kickoffAt: past, report: PLAYED })).toBe("CANCELLED");
    expect(
      at({ status: "CANCELLED", kickoffAt: past, report: { ...PLAYED, homeForfeit: true } }),
    ).toBe("CANCELLED");
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
        report: null,
      }),
    ).toBe("NEEDS_REFEREE");
  });
});

describe("isForfeit", () => {
  it("is false without a report and without a forfeit", () => {
    expect(isForfeit(null)).toBe(false);
    expect(isForfeit(PLAYED)).toBe(false);
  });

  it("is true when either side gave the match up", () => {
    expect(isForfeit({ homeForfeit: true, awayForfeit: false })).toBe(true);
    expect(isForfeit({ homeForfeit: false, awayForfeit: true })).toBe(true);
    expect(isForfeit({ homeForfeit: true, awayForfeit: true })).toBe(true);
  });
});

describe("matchDisplayWhere", () => {
  it("matches a called-off fixture on the stored column alone", () => {
    expect(matchDisplayWhere("CANCELLED", now)).toEqual({ status: "CANCELLED" });
    expect(matchDisplayWhere("POSTPONED", now)).toEqual({ status: "POSTPONED" });
  });

  it("asks for a played-out report and nothing about the clock", () => {
    expect(matchDisplayWhere("COMPLETED", now)).toEqual({
      status: { notIn: ["CANCELLED", "POSTPONED"] },
      report: { is: { homeForfeit: false, awayForfeit: false } },
    });
  });

  it("asks for a report with a forfeit on either side", () => {
    expect(matchDisplayWhere("FORFEITED", now)).toEqual({
      status: { notIn: ["CANCELLED", "POSTPONED"] },
      report: { is: { OR: [{ homeForfeit: true }, { awayForfeit: true }] } },
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
    for (const bucket of [
      "COMPLETED",
      "FORFEITED",
      "WAITING_REPORT",
      "NOT_STARTED",
      "NEEDS_REFEREE",
    ] as const) {
      expect(matchDisplayWhere(bucket, now).status).toEqual({
        notIn: ["CANCELLED", "POSTPONED"],
      });
    }
  });
});
