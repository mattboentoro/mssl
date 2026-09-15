import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatTime, toDateTimeInputValue } from "@/lib/dates";
import {
  LEAGUE_TIME_ZONE,
  parseLeagueDateTime,
  toZonedParts,
  zoneAbbreviation,
  zoneOffsetMs,
  zonedToUtc,
} from "@/lib/timezone";

const HOUR = 60 * 60 * 1000;

describe("league timezone", () => {
  it("targets Redmond", () => {
    expect(LEAGUE_TIME_ZONE).toBe("America/Los_Angeles");
  });

  it("is UTC-8 in winter and UTC-7 in summer", () => {
    expect(zoneOffsetMs(new Date("2026-01-15T20:00:00Z"))).toBe(-8 * HOUR);
    expect(zoneOffsetMs(new Date("2026-07-15T20:00:00Z"))).toBe(-7 * HOUR);
  });

  it("names the offset in use", () => {
    expect(zoneAbbreviation(new Date("2026-01-15T20:00:00Z"))).toBe("PST");
    expect(zoneAbbreviation(new Date("2026-07-15T20:00:00Z"))).toBe("PDT");
  });
});

describe("toZonedParts", () => {
  it("shifts an instant back into Redmond wall-clock", () => {
    // 02:00Z on the 8th is still the evening of the 7th in Redmond.
    expect(toZonedParts(new Date("2026-03-08T02:00:00Z"))).toEqual({
      year: 2026,
      month: 3,
      day: 7,
      hour: 18,
      minute: 0,
      second: 0,
      weekday: 6,
    });
  });

  it("reports weekday as 0=Sunday", () => {
    expect(toZonedParts(new Date("2026-03-08T20:00:00Z")).weekday).toBe(0);
  });
});

describe("zonedToUtc", () => {
  it("round-trips a winter kick-off", () => {
    const instant = zonedToUtc(2026, 1, 15, 18, 30);
    expect(instant.toISOString()).toBe("2026-01-16T02:30:00.000Z");
    expect(toZonedParts(instant).hour).toBe(18);
  });

  it("round-trips a summer kick-off", () => {
    const instant = zonedToUtc(2026, 7, 15, 18, 30);
    expect(instant.toISOString()).toBe("2026-07-16T01:30:00.000Z");
    expect(toZonedParts(instant).hour).toBe(18);
  });

  it("keeps the wall-clock hour stable either side of the spring DST switch", () => {
    // Clocks go forward 2026-03-08 in the US. 18:00 must stay 18:00 on both days.
    const before = zonedToUtc(2026, 3, 7, 18, 0);
    const after = zonedToUtc(2026, 3, 8, 18, 0);
    expect(toZonedParts(before).hour).toBe(18);
    expect(toZonedParts(after).hour).toBe(18);
    // The absolute gap is 23h, not 24h, because an hour was skipped.
    expect(after.getTime() - before.getTime()).toBe(23 * HOUR);
  });

  it("keeps the wall-clock hour stable either side of the autumn DST switch", () => {
    const before = zonedToUtc(2026, 10, 31, 18, 0);
    const after = zonedToUtc(2026, 11, 1, 18, 0);
    expect(toZonedParts(after).hour).toBe(18);
    expect(after.getTime() - before.getTime()).toBe(25 * HOUR);
  });

  it("defaults the time of day to midnight", () => {
    expect(toZonedParts(zonedToUtc(2026, 5, 4))).toMatchObject({ hour: 0, minute: 0, second: 0 });
  });
});

describe("parseLeagueDateTime", () => {
  it("reads a bare wall-clock as Redmond time", () => {
    expect(parseLeagueDateTime("2026-03-07 18:00")?.toISOString()).toBe("2026-03-08T02:00:00.000Z");
  });

  it("accepts the T separator", () => {
    expect(parseLeagueDateTime("2026-03-07T18:00")?.toISOString()).toBe("2026-03-08T02:00:00.000Z");
  });

  it("accepts seconds", () => {
    expect(parseLeagueDateTime("2026-03-07 18:00:30")?.toISOString()).toBe(
      "2026-03-08T02:00:30.000Z",
    );
  });

  it("treats a date-only value as midnight in Redmond", () => {
    expect(parseLeagueDateTime("2026-03-07")?.toISOString()).toBe("2026-03-07T08:00:00.000Z");
  });

  it("honours an explicit Z so older ISO exports still import", () => {
    expect(parseLeagueDateTime("2026-03-07T18:00:00Z")?.toISOString()).toBe(
      "2026-03-07T18:00:00.000Z",
    );
  });

  it("honours an explicit numeric offset", () => {
    expect(parseLeagueDateTime("2026-03-07T18:00:00+02:00")?.toISOString()).toBe(
      "2026-03-07T16:00:00.000Z",
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseLeagueDateTime("  2026-03-07 18:00  ")?.toISOString()).toBe(
      "2026-03-08T02:00:00.000Z",
    );
  });

  it("rejects a day that does not exist rather than rolling it over", () => {
    expect(parseLeagueDateTime("2026-02-31")).toBeNull();
  });

  it("rejects an out-of-range month, hour or minute", () => {
    expect(parseLeagueDateTime("2026-13-01")).toBeNull();
    expect(parseLeagueDateTime("2026-03-07 24:00")).toBeNull();
    expect(parseLeagueDateTime("2026-03-07 18:60")).toBeNull();
  });

  it("rejects unparseable text", () => {
    expect(parseLeagueDateTime("")).toBeNull();
    expect(parseLeagueDateTime("next tuesday")).toBeNull();
    expect(parseLeagueDateTime("13/5/2026")).toBeNull();
  });

  it("accepts the month-first dates organisers actually type", () => {
    // 8/5/2026 is 5 August, PDT (UTC-7).
    expect(parseLeagueDateTime("8/5/2026 17:30")?.toISOString()).toBe("2026-08-06T00:30:00.000Z");
    // Two-digit years and a 12-hour clock are both common in exported files.
    expect(parseLeagueDateTime("8/5/26 5:30 pm")?.toISOString()).toBe("2026-08-06T00:30:00.000Z");
    // 07/03 is 3 July read month-first, never 7 March.
    expect(parseLeagueDateTime("07/03/2026")?.toISOString()).toBe("2026-07-03T07:00:00.000Z");
  });

  it("reads an ISO date as ISO even though the digits would also parse month-first", () => {
    // 2026-08-05 must never be read as the 8th day of month 5.
    expect(parseLeagueDateTime("2026-08-05 17:30")?.toISOString()).toBe("2026-08-06T00:30:00.000Z");
    expect(parseLeagueDateTime("2026-8-5 17:30")?.toISOString()).toBe("2026-08-06T00:30:00.000Z");
  });

  it("treats midnight and noon on a 12-hour clock correctly", () => {
    // 12am is the start of the day, 12pm is the middle of it.
    expect(parseLeagueDateTime("2026-07-04 12:00 am")?.toISOString()).toBe(
      "2026-07-04T07:00:00.000Z",
    );
    expect(parseLeagueDateTime("2026-07-04 12:00 pm")?.toISOString()).toBe(
      "2026-07-04T19:00:00.000Z",
    );
  });

  it("round-trips through the datetime-local input format", () => {
    const instant = parseLeagueDateTime("2026-07-04 19:45");
    expect(instant).not.toBeNull();
    expect(toDateTimeInputValue(instant!)).toBe("2026-07-04T19:45");
  });
});

describe("formatters render league time", () => {
  const winter = new Date("2026-01-16T02:30:00Z"); // 18:30 Redmond, PST
  const summer = new Date("2026-07-16T01:30:00Z"); // 18:30 Redmond, PDT

  it("formats the local date, not the UTC one", () => {
    // The instant is 16 Jan in UTC but still the evening of the 15th in Redmond.
    expect(formatDate(winter)).toBe("Thu 15 Jan");
  });

  it("formats the local time", () => {
    expect(formatTime(winter)).toBe("18:30");
    expect(formatTime(summer)).toBe("18:30");
  });

  it("labels the offset in use instead of UTC", () => {
    expect(formatDateTime(winter)).toContain("PST");
    expect(formatDateTime(summer)).toContain("PDT");
    expect(formatDateTime(winter)).not.toContain("UTC");
  });
});
