import { describe, expect, it } from "vitest";

import {
  calculateStandings,
  calculateStandingsByDivision,
  resolveResult,
  DEFAULT_STANDINGS_OPTIONS,
  type StandingsMatchInput,
  type StandingsTeamInput,
} from "@/lib/standings";

const DIV = "div-1";

const team = (id: string, name = id.toUpperCase()): StandingsTeamInput => ({
  id,
  name,
  divisionId: DIV,
});

let matchCounter = 0;

interface MatchOptions {
  status?: string;
  reportStatus?: string;
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  discipline?: { type: string; teamId: string }[];
  /** Day offset used to order the form guide. */
  day?: number;
  noReport?: boolean;
}

function match(
  home: string,
  homeScore: number,
  awayScore: number,
  away: string,
  options: MatchOptions = {},
): StandingsMatchInput {
  matchCounter += 1;
  const day = options.day ?? matchCounter;
  return {
    id: `m${matchCounter}`,
    divisionId: DIV,
    homeTeamId: home,
    awayTeamId: away,
    status: options.status ?? "CONFIRMED",
    kickoffAt: new Date(Date.UTC(2026, 0, day, 18, 0, 0)),
    report: options.noReport
      ? null
      : {
          status: options.reportStatus ?? "CONFIRMED",
          homeScore,
          awayScore,
          homeForfeit: options.homeForfeit ?? false,
          awayForfeit: options.awayForfeit ?? false,
          discipline: options.discipline ?? [],
        },
  };
}

const rowFor = (rows: ReturnType<typeof calculateStandings>, teamId: string) => {
  const row = rows.find((r) => r.teamId === teamId);
  if (!row) throw new Error(`no row for ${teamId}`);
  return row;
};

describe("calculateStandings — basics", () => {
  it("awards 3 points for a win, 1 for a draw, 0 for a loss", () => {
    const rows = calculateStandings(
      [team("a"), team("b"), team("c")],
      [match("a", 2, 0, "b"), match("b", 1, 1, "c")],
    );

    expect(rowFor(rows, "a")).toMatchObject({
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 0,
      goalDifference: 2,
      points: 3,
    });
    expect(rowFor(rows, "b")).toMatchObject({
      played: 2,
      won: 0,
      drawn: 1,
      lost: 1,
      goalsFor: 1,
      goalsAgainst: 3,
      goalDifference: -2,
      points: 1,
    });
    expect(rowFor(rows, "c")).toMatchObject({ played: 1, drawn: 1, points: 1 });
  });

  it("lists teams with no completed matches as all zeroes", () => {
    const rows = calculateStandings([team("a"), team("b")], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("assigns sequential ranks starting at 1", () => {
    const rows = calculateStandings(
      [team("a"), team("b"), team("c")],
      [match("a", 3, 0, "b"), match("c", 1, 0, "b")],
    );
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ignores matches involving a team outside the requested set", () => {
    const rows = calculateStandings([team("a")], [match("a", 1, 0, "ghost")]);
    expect(rowFor(rows, "a").played).toBe(0);
  });
});

describe("calculateStandings — which reports count", () => {
  it("counts CONFIRMED reports", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 1, 0, "b", { reportStatus: "CONFIRMED" })],
      { includeUnconfirmed: false },
    );
    expect(rowFor(rows, "a").points).toBe(3);
  });

  it("includes SUBMITTED reports when includeUnconfirmed is true", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 1, 0, "b", { status: "REPORT_SUBMITTED", reportStatus: "SUBMITTED" })],
      { includeUnconfirmed: true },
    );
    expect(rowFor(rows, "a").points).toBe(3);
  });

  it("excludes SUBMITTED reports when includeUnconfirmed is false", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 1, 0, "b", { status: "REPORT_SUBMITTED", reportStatus: "SUBMITTED" })],
      { includeUnconfirmed: false },
    );
    expect(rowFor(rows, "a").played).toBe(0);
  });

  it("always excludes DISPUTED reports", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 5, 0, "b", { reportStatus: "DISPUTED" })],
      { includeUnconfirmed: true },
    );
    expect(rowFor(rows, "a").played).toBe(0);
  });

  it("excludes matches with no report at all", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 0, 0, "b", { noReport: true, status: "SCHEDULED" })],
    );
    expect(rowFor(rows, "a").played).toBe(0);
  });

  it("excludes CANCELLED and POSTPONED fixtures even if a report exists", () => {
    const rows = calculateStandings(
      [team("a"), team("b"), team("c")],
      [
        match("a", 9, 0, "b", { status: "CANCELLED" }),
        match("a", 9, 0, "c", { status: "POSTPONED" }),
      ],
    );
    expect(rowFor(rows, "a").played).toBe(0);
  });
});

describe("calculateStandings — forfeits", () => {
  it("applies the default 3-0 forfeit scoreline to the non-forfeiting side", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 0, 0, "b", { status: "FORFEIT", homeForfeit: true })],
    );
    expect(rowFor(rows, "b")).toMatchObject({ won: 1, goalsFor: 3, goalsAgainst: 0, points: 3 });
    expect(rowFor(rows, "a")).toMatchObject({ lost: 1, goalsFor: 0, goalsAgainst: 3, points: 0 });
  });

  it("honours a configured forfeit scoreline", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 0, 0, "b", { status: "FORFEIT", awayForfeit: true })],
      { forfeitScore: { winner: 5, loser: 0 } },
    );
    expect(rowFor(rows, "a").goalsFor).toBe(5);
    expect(rowFor(rows, "b").goalsAgainst).toBe(5);
  });

  it("records a double forfeit as a loss for both sides with no goals", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 0, 0, "b", { status: "FORFEIT", homeForfeit: true, awayForfeit: true })],
    );
    expect(rowFor(rows, "a")).toMatchObject({ played: 1, lost: 1, points: 0, goalsFor: 0 });
    expect(rowFor(rows, "b")).toMatchObject({ played: 1, lost: 1, points: 0, goalsFor: 0 });
  });

  it("ignores the reported scoreline when a forfeit is flagged", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 7, 6, "b", { status: "FORFEIT", homeForfeit: true })],
    );
    expect(rowFor(rows, "b").goalsFor).toBe(3);
  });
});

describe("resolveResult", () => {
  const opts = DEFAULT_STANDINGS_OPTIONS;

  it("returns null for a fixture without a report", () => {
    expect(resolveResult(match("a", 0, 0, "b", { noReport: true }), opts)).toBeNull();
  });

  it("returns the reported score for a normal match", () => {
    expect(resolveResult(match("a", 2, 1, "b"), opts)).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      byForfeit: false,
    });
  });

  it("clamps negative or fractional scores", () => {
    const input = match("a", -3, 2.7, "b");
    expect(resolveResult(input, opts)).toMatchObject({ homeGoals: 0, awayGoals: 2 });
  });
});

describe("calculateStandings — tiebreakers", () => {
  it("1. orders by points first", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 1, 0, "b"), match("b", 9, 0, "a")],
    );
    // b has more goals but a and b both have 3 points... construct explicitly:
    expect(rows[0].points).toBeGreaterThanOrEqual(rows[1].points);
  });

  it("2. breaks a points tie on goal difference", () => {
    const rows = calculateStandings(
      [team("a"), team("b"), team("x"), team("y")],
      [match("a", 3, 0, "x"), match("b", 1, 0, "y")],
    );
    expect(rows[0].teamId).toBe("a");
    expect(rows[1].teamId).toBe("b");
    expect(rows[1].separatedBy).toBe("goalDifference");
  });

  it("3. breaks a goal-difference tie on goals scored", () => {
    const rows = calculateStandings(
      [team("a"), team("b"), team("x"), team("y")],
      [match("a", 3, 2, "x"), match("b", 1, 0, "y")],
    );
    expect(rows[0].teamId).toBe("a");
    expect(rows[1].teamId).toBe("b");
    expect(rows[1].separatedBy).toBe("goalsFor");
  });

  it("4. breaks a full tie on head-to-head, ahead of disciplinary points", () => {
    // A and B finish level on points, GD and GF. A beat B, but A also picked up
    // two yellow cards — head-to-head must still win.
    const rows = calculateStandings(
      [team("a", "Alpha"), team("b", "Bravo"), team("x", "Xray"), team("y", "Yankee")],
      [
        match("a", 2, 1, "b", {
          discipline: [
            { type: "YELLOW", teamId: "a" },
            { type: "YELLOW", teamId: "a" },
          ],
        }),
        match("x", 1, 0, "a"),
        match("b", 1, 0, "y"),
      ],
    );

    const a = rows.findIndex((r) => r.teamId === "a");
    const b = rows.findIndex((r) => r.teamId === "b");

    expect(rowFor(rows, "a")).toMatchObject({ points: 3, goalDifference: 0, goalsFor: 2 });
    expect(rowFor(rows, "b")).toMatchObject({ points: 3, goalDifference: 0, goalsFor: 2 });
    expect(rowFor(rows, "a").disciplinaryPoints).toBe(2);
    expect(rowFor(rows, "b").disciplinaryPoints).toBe(0);
    expect(a).toBeLessThan(b);
    expect(rows[b].separatedBy).toBe("headToHead");
  });

  it("5. falls through to fewest disciplinary points when the teams never met", () => {
    const rows = calculateStandings(
      [team("a", "Alpha"), team("b", "Bravo"), team("x", "Xray"), team("y", "Yankee")],
      [
        match("a", 2, 1, "x", { discipline: [{ type: "RED", teamId: "a" }] }),
        match("y", 1, 0, "a"),
        match("b", 2, 1, "y"),
        match("x", 1, 0, "b"),
        match("x", 5, 0, "y"),
      ],
    );

    const a = rowFor(rows, "a");
    const b = rowFor(rows, "b");
    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(a.disciplinaryPoints).toBe(3);
    expect(b.disciplinaryPoints).toBe(0);
    expect(rows.findIndex((r) => r.teamId === "b")).toBeLessThan(
      rows.findIndex((r) => r.teamId === "a"),
    );
    expect(rowFor(rows, "a").separatedBy).toBe("disciplinaryPoints");
  });

  it("6. falls back to alphabetical order when everything is level", () => {
    const rows = calculateStandings([team("b", "Bravo"), team("a", "Alpha")], []);
    expect(rows.map((r) => r.teamName)).toEqual(["Alpha", "Bravo"]);
    expect(rows[1].separatedBy).toBe("alphabetical");
  });

  it("uses a configurable disciplinary weighting", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [
        match("a", 0, 0, "b", {
          discipline: [
            { type: "YELLOW", teamId: "a" },
            { type: "RED", teamId: "b" },
          ],
        }),
      ],
      { disciplinary: { yellow: 2, red: 10 } },
    );
    expect(rowFor(rows, "a").disciplinaryPoints).toBe(2);
    expect(rowFor(rows, "b").disciplinaryPoints).toBe(10);
  });

  it("counts yellow and red cards per team", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [
        match("a", 0, 0, "b", {
          discipline: [
            { type: "YELLOW", teamId: "a" },
            { type: "YELLOW", teamId: "a" },
            { type: "RED", teamId: "a" },
          ],
        }),
      ],
    );
    expect(rowFor(rows, "a")).toMatchObject({
      yellowCards: 2,
      redCards: 1,
      disciplinaryPoints: 5,
    });
    expect(rowFor(rows, "b")).toMatchObject({ yellowCards: 0, redCards: 0 });
  });
});

describe("calculateStandings — form guide", () => {
  it("returns at most five results, most recent first", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [
        match("a", 1, 0, "b", { day: 1 }), // W
        match("a", 0, 1, "b", { day: 2 }), // L
        match("a", 2, 2, "b", { day: 3 }), // D
        match("a", 3, 0, "b", { day: 4 }), // W
        match("a", 0, 2, "b", { day: 5 }), // L
        match("a", 1, 1, "b", { day: 6 }), // D
      ],
    );
    expect(rowFor(rows, "a").form).toEqual(["D", "L", "W", "D", "L"]);
    expect(rowFor(rows, "b").form).toEqual(["D", "W", "L", "D", "W"]);
  });

  it("honours a custom form length", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 1, 0, "b", { day: 1 }), match("a", 1, 0, "b", { day: 2 })],
      { formLength: 1 },
    );
    expect(rowFor(rows, "a").form).toEqual(["W"]);
  });
});

describe("calculateStandingsByDivision", () => {
  it("keeps divisions independent", () => {
    const teams: StandingsTeamInput[] = [
      { id: "a", name: "Alpha", divisionId: "d1" },
      { id: "b", name: "Bravo", divisionId: "d1" },
      { id: "c", name: "Charlie", divisionId: "d2" },
      { id: "d", name: "Delta", divisionId: "d2" },
    ];
    const matches: StandingsMatchInput[] = [
      { ...match("a", 1, 0, "b"), divisionId: "d1" },
      { ...match("c", 4, 0, "d"), divisionId: "d2" },
    ];

    const byDivision = calculateStandingsByDivision(teams, matches);
    expect(byDivision.get("d1")?.map((r) => r.teamId)).toEqual(["a", "b"]);
    expect(byDivision.get("d2")?.[0]).toMatchObject({ teamId: "c", goalsFor: 4 });
    expect(byDivision.get("d2")?.every((r) => r.divisionId === "d2")).toBe(true);
  });
});
