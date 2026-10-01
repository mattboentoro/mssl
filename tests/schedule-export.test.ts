import { describe, expect, it } from "vitest";

import { buildAdminMatchCsv } from "@/lib/schedule-export";

describe("Admin match CSV export", () => {
  it("includes assigned referees and match statuses without the counts column", () => {
    const csv = buildAdminMatchCsv(
      [
        {
          matchweek: "7",
          kickoffAt: new Date("2026-10-09T01:30:00Z"),
          venueName: "Marymoor, Turf A",
          status: "CONFIRMED",
          refereeId: "referee-1",
          division: { name: "Premier" },
          homeTeam: { name: "RCS United" },
          awayTeam: { name: "Chargers" },
          referee: { name: "Riley Whistle" },
          report: { homeForfeit: false, awayForfeit: false },
        },
        {
          matchweek: "8",
          kickoffAt: new Date("2026-10-16T02:30:00Z"),
          venueName: null,
          status: "SCHEDULED",
          refereeId: null,
          division: { name: "Premier" },
          homeTeam: { name: "Chargers" },
          awayTeam: { name: "RCS United" },
          referee: null,
          report: null,
        },
        {
          matchweek: "9",
          kickoffAt: new Date("2026-09-25T02:30:00Z"),
          venueName: "Grass Lawn",
          status: "ASSIGNED",
          refereeId: "referee-1",
          division: { name: "Premier" },
          homeTeam: { name: "RCS United" },
          awayTeam: { name: "Chargers" },
          referee: { name: "Riley Whistle" },
          report: null,
        },
        {
          matchweek: "10",
          kickoffAt: new Date("2026-09-26T02:30:00Z"),
          venueName: "Grass Lawn",
          status: "FORFEIT",
          refereeId: "referee-1",
          division: { name: "Premier" },
          homeTeam: { name: "Chargers" },
          awayTeam: { name: "RCS United" },
          referee: { name: "Riley Whistle" },
          report: { homeForfeit: true, awayForfeit: false },
        },
      ],
      new Date("2026-10-01T12:00:00Z"),
    );

    expect(csv).toBe(
      [
        "matchweek,kickoff,division,home,away,venue,referee,status",
        '7,2026-10-08 18:30,Premier,RCS United,Chargers,"Marymoor, Turf A",Riley Whistle,Completed',
        "8,2026-10-15 19:30,Premier,Chargers,RCS United,,,Need a referee",
        "9,2026-09-24 19:30,Premier,RCS United,Chargers,Grass Lawn,Riley Whistle,Waiting report",
        "10,2026-09-25 19:30,Premier,Chargers,RCS United,Grass Lawn,Riley Whistle,Forfeited",
        "",
      ].join("\r\n"),
    );
  });
});
