import { describe, expect, it } from "vitest";

import { buildAdminMatchCsv } from "@/lib/schedule-export";

describe("Admin match CSV export", () => {
  it("includes assigned referees and match statuses without the counts column", () => {
    const csv = buildAdminMatchCsv([
      {
        matchweek: "7",
        kickoffAt: new Date("2026-10-09T01:30:00Z"),
        venueName: "Marymoor, Turf A",
        status: "ASSIGNED",
        division: { name: "Premier" },
        homeTeam: { name: "RCS United" },
        awayTeam: { name: "Chargers" },
        referee: { name: "Riley Whistle" },
      },
      {
        matchweek: "8",
        kickoffAt: new Date("2026-10-16T02:30:00Z"),
        venueName: null,
        status: "SCHEDULED",
        division: { name: "Premier" },
        homeTeam: { name: "Chargers" },
        awayTeam: { name: "RCS United" },
        referee: null,
      },
    ]);

    expect(csv).toBe(
      [
        "matchweek,kickoff,division,home,away,venue,referee,status",
        '7,2026-10-08 18:30,Premier,RCS United,Chargers,"Marymoor, Turf A",Riley Whistle,Referee assigned',
        "8,2026-10-15 19:30,Premier,Chargers,RCS United,,,Needs a referee",
        "",
      ].join("\r\n"),
    );
  });
});
