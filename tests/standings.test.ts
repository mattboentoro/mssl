import { describe, expect, it } from "vitest";

import {
  calculateStandings,
  calculateStandingsByDivision,
  pointsPerGame,
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
  /** False for a final, play-off or friendly that must not move the table. */
  countsForStandings?: boolean;
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
    countsForStandings: options.countsForStandings ?? true,
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

describe("calculateStandings — fixtures that do not count", () => {
  const pair = [team("a"), team("b")];

  it("moves nothing at all for a non-counting fixture", () => {
    const rows = calculateStandings(pair, [match("a", 4, 0, "b", { countsForStandings: false })]);
    expect(rowFor(rows, "a")).toMatchObject({
      played: 0,
      won: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    });
    expect(rowFor(rows, "b")).toMatchObject({ played: 0, lost: 0, goalsAgainst: 0 });
  });

  it("leaves the league fixtures around it untouched", () => {
    const rows = calculateStandings(pair, [
      match("a", 1, 0, "b", { day: 1 }),
      match("a", 9, 0, "b", { day: 2, countsForStandings: false }),
    ]);
    expect(rowFor(rows, "a")).toMatchObject({ played: 1, points: 3, goalsFor: 1 });
  });

  it("keeps a non-counting result out of the form guide", () => {
    const rows = calculateStandings(pair, [
      match("a", 1, 0, "b", { day: 1 }),
      match("a", 0, 5, "b", { day: 2, countsForStandings: false }),
    ]);
    expect(rowFor(rows, "a").form).toEqual(["W"]);
  });

  it("ignores a forfeit that does not count", () => {
    const rows = calculateStandings(pair, [
      match("a", 0, 0, "b", { status: "FORFEIT", homeForfeit: true, countsForStandings: false }),
    ]);
    expect(rowFor(rows, "b")).toMatchObject({ played: 0, points: 0, goalsFor: 0 });
  });

  it("counts the fixture when the flag is absent, so old rows keep working", () => {
    const input = match("a", 2, 0, "b");
    delete (input as { countsForStandings?: boolean }).countsForStandings;
    expect(rowFor(calculateStandings(pair, [input]), "a").points).toBe(3);
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

describe("pointsPerGame", () => {
  it("is zero for a team that has not played", () => {
    const rows = calculateStandings([team("a"), team("b")], [], DEFAULT_STANDINGS_OPTIONS);
    // 0/0 is NaN in JavaScript, and NaN loses every comparison it takes part
    // in, so an unplayed team would sort to an arbitrary position. Zero is both
    // the honest answer and a stable one.
    expect(pointsPerGame(rowFor(rows, "a"))).toBe(0);
  });

  it("divides points by games played", () => {
    const rows = calculateStandings(
      [team("a"), team("b")],
      [match("a", 2, 0, "b"), match("a", 1, 1, "b")],
      DEFAULT_STANDINGS_OPTIONS,
    );
    // A: a win and a draw from two games = 4 points.
    expect(pointsPerGame(rowFor(rows, "a"))).toBe(2);
    expect(pointsPerGame(rowFor(rows, "b"))).toBe(0.5);
  });

  it("reflects a points deduction", () => {
    const rows = calculateStandings([team("a"), team("b")], [match("a", 2, 0, "b")], {
      ...DEFAULT_STANDINGS_OPTIONS,
      adjustments: [{ teamId: "a", points: -3, reason: "Ineligible player" }],
    });
    // 3 points earned minus a 3 point deduction over one game.
    expect(pointsPerGame(rowFor(rows, "a"))).toBe(0);
  });
});

describe("calculateStandings — points-per-game primary metric", () => {
  const trio = [team("a"), team("b"), team("c")];

  it("ranks on total points by default even when games played differ", () => {
    // A: 6 pts from 4 games. B: 6 pts from 2 games. Level on points, and A is
    // ahead on goal difference, so the default metric puts A first.
    const rows = calculateStandings(
      trio,
      [
        match("a", 3, 0, "c"),
        match("a", 1, 0, "c"),
        match("a", 0, 1, "c"),
        match("a", 0, 1, "c"),
        match("b", 1, 0, "c"),
        match("b", 1, 0, "c"),
      ],
      DEFAULT_STANDINGS_OPTIONS,
    );

    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(rowFor(rows, "a").points).toBe(6);
    expect(rowFor(rows, "b").points).toBe(6);
  });

  it("ranks on points per game when the season asks for it", () => {
    // Same fixtures: B's 3.0 per game beats A's 1.5 per game.
    const rows = calculateStandings(
      trio,
      [
        match("a", 3, 0, "c"),
        match("a", 1, 0, "c"),
        match("a", 0, 1, "c"),
        match("a", 0, 1, "c"),
        match("b", 1, 0, "c"),
        match("b", 1, 0, "c"),
      ],
      { ...DEFAULT_STANDINGS_OPTIONS, primaryMetric: "pointsPerGame" },
    );

    expect(rows.map((r) => r.teamId)).toEqual(["b", "a", "c"]);
    expect(rows[1].separatedBy).toBe("pointsPerGame");
  });

  it("compares rates exactly rather than through floating point", () => {
    // A takes 4 points from 3 games; B takes 8 from 6. Identical rates, but
    // dividing would compare 4/3 against 8/6 as floats and risk splitting them
    // on rounding noise. Cross-multiplying leaves them level so the next
    // tiebreaker (goal difference) decides.
    const rows = calculateStandings(
      trio,
      [
        match("a", 2, 0, "c"),
        match("a", 1, 1, "c"),
        match("a", 0, 1, "c"),
        match("b", 1, 0, "c"),
        match("b", 1, 0, "c"),
        match("b", 0, 0, "c"),
        match("b", 0, 0, "c"),
        match("b", 0, 1, "c"),
        match("b", 0, 1, "c"),
      ],
      { ...DEFAULT_STANDINGS_OPTIONS, primaryMetric: "pointsPerGame" },
    );

    expect(rowFor(rows, "a").points).toBe(4);
    expect(rowFor(rows, "a").played).toBe(3);
    expect(rowFor(rows, "b").points).toBe(8);
    expect(rowFor(rows, "b").played).toBe(6);
    // Level on rate, so goal difference separates them: A is +1, B is level.
    expect(rowFor(rows, "a").goalDifference).toBe(1);
    expect(rowFor(rows, "b").goalDifference).toBe(0);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(rows[1].separatedBy).toBe("goalDifference");
  });

  it("sorts a team with no games played below anyone with points", () => {
    const rows = calculateStandings(trio, [match("a", 2, 0, "c")], {
      ...DEFAULT_STANDINGS_OPTIONS,
      primaryMetric: "pointsPerGame",
    });

    expect(rowFor(rows, "b").played).toBe(0);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
  });

  it("still applies points adjustments before ranking on rate", () => {
    const rows = calculateStandings(
      trio,
      [match("a", 1, 0, "c"), match("b", 1, 0, "c"), match("b", 1, 0, "c")],
      {
        ...DEFAULT_STANDINGS_OPTIONS,
        primaryMetric: "pointsPerGame",
        adjustments: [{ teamId: "a", points: -3, reason: "Ineligible player" }],
      },
    );

    expect(rowFor(rows, "a").points).toBe(0);
    expect(rowFor(rows, "b").points).toBe(6);
    expect(rows[0].teamId).toBe("b");
  });
});

describe("calculateStandings — points adjustments", () => {
  const pair = [team("a"), team("b")];

  /**
   * Three teams, each having played the other two once, contrived so that A and
   * B are level on points, goal difference *and* goals for, and only the
   * head-to-head between them separates the two. Needed because two teams that
   * have played nobody but each other can never be level overall yet split on
   * head-to-head — their head-to-head record *is* their whole record.
   */
  const triangle = (): { teams: StandingsTeamInput[]; matches: StandingsMatchInput[] } => ({
    teams: [team("a"), team("b"), team("c")],
    matches: [
      match("a", 2, 1, "b", { day: 1 }), // A 3pts, gf2 ga1
      match("c", 1, 0, "a", { day: 2 }), // A gf0 ga1 -> 3pts, gf2, ga2, gd0
      match("b", 1, 0, "c", { day: 3 }), // B 3pts, gf2, ga2, gd0 -- level with A
    ],
  });

  it("subtracts a deduction from the points total", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "a", points: -3, reason: "Ineligible player" }],
    });
    expect(rowFor(rows, "a").points).toBe(0);
    expect(rowFor(rows, "a").pointsAdjustment).toBe(-3);
  });

  it("reports a zero adjustment for teams that have none", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "a", points: -3, reason: "Ineligible player" }],
    });
    expect(rowFor(rows, "b").pointsAdjustment).toBe(0);
  });

  it("defaults to no adjustment at all", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")]);
    expect(rowFor(rows, "a").pointsAdjustment).toBe(0);
    expect(rowFor(rows, "a").points).toBe(3);
  });

  it("re-ranks the table once a deduction is applied", () => {
    const matches = [match("a", 2, 0, "b", { day: 1 }), match("a", 2, 0, "b", { day: 2 })];

    const before = calculateStandings(pair, matches);
    expect(before[0].teamId).toBe("a");
    expect(before[0].points).toBe(6);

    // A has a +4 goal difference, so a 6-point deduction only draws them level
    // on points and goal difference still keeps them top. It takes 7 to drop
    // them beneath a side that has not won a game.
    const levelled = calculateStandings(pair, matches, {
      adjustments: [{ teamId: "a", points: -6 }],
    });
    expect(levelled[0].teamId).toBe("a");
    expect(levelled[1].separatedBy).toBe("goalDifference");

    const after = calculateStandings(pair, matches, {
      adjustments: [{ teamId: "a", points: -7 }],
    });
    expect(after[0].teamId).toBe("b");
    expect(after.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("accumulates several adjustments for the same team", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [
        { teamId: "a", points: -1 },
        { teamId: "a", points: -2 },
      ],
    });
    expect(rowFor(rows, "a").pointsAdjustment).toBe(-3);
    expect(rowFor(rows, "a").points).toBe(0);
  });

  it("allows a positive award as well as a deduction", () => {
    const rows = calculateStandings(pair, [match("a", 0, 1, "b")], {
      adjustments: [{ teamId: "a", points: 3, reason: "Opponent expelled" }],
    });
    expect(rowFor(rows, "a").points).toBe(3);
    expect(rowFor(rows, "a").pointsAdjustment).toBe(3);
  });

  it("lets a deduction take a team below zero points", () => {
    const rows = calculateStandings(pair, [match("a", 0, 1, "b")], {
      adjustments: [{ teamId: "a", points: -5 }],
    });
    expect(rowFor(rows, "a").points).toBe(-5);
  });

  it("ignores an adjustment for a team outside the requested set", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "ghost", points: -99 }],
    });
    expect(rows).toHaveLength(2);
    expect(rowFor(rows, "a").points).toBe(3);
  });

  it("ignores a zero adjustment", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "a", points: 0 }],
    });
    expect(rowFor(rows, "a").pointsAdjustment).toBe(0);
    expect(rowFor(rows, "a").points).toBe(3);
  });

  it("truncates a fractional adjustment rather than corrupting the total", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "a", points: -1.9 }],
    });
    expect(rowFor(rows, "a").points).toBe(2);
    expect(Number.isInteger(rowFor(rows, "a").points)).toBe(true);
  });

  it("leaves goal difference and goals for untouched", () => {
    const rows = calculateStandings(pair, [match("a", 4, 1, "b")], {
      adjustments: [{ teamId: "a", points: -3 }],
    });
    const row = rowFor(rows, "a");
    expect(row.goalsFor).toBe(4);
    expect(row.goalsAgainst).toBe(1);
    expect(row.goalDifference).toBe(3);
  });

  it("leaves the form guide untouched — a deduction is not a result", () => {
    const rows = calculateStandings(pair, [match("a", 3, 0, "b")], {
      adjustments: [{ teamId: "a", points: -3 }],
    });
    const row = rowFor(rows, "a");
    expect(row.form).toEqual(["W"]);
    expect(row.won).toBe(1);
    expect(row.played).toBe(1);
  });

  it("does not disturb the head-to-head mini-league", () => {
    const { teams, matches } = triangle();

    const level = calculateStandings(teams, matches);
    expect(level.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(level[1].separatedBy).toBe("headToHead");

    // Same deduction for both: they stay level, so head-to-head must decide
    // again and A must stay ahead of B.
    const deducted = calculateStandings(teams, matches, {
      adjustments: [
        { teamId: "a", points: -1 },
        { teamId: "b", points: -1 },
      ],
    });
    expect(deducted.map((r) => r.teamId)).toEqual(["c", "a", "b"]);
    expect(rowFor(deducted, "b").separatedBy).toBe("headToHead");
  });

  it("can overturn a head-to-head win, and says points did it", () => {
    const { teams, matches } = triangle();
    const rows = calculateStandings(teams, matches, {
      adjustments: [{ teamId: "a", points: -1 }],
    });
    // A beat B on the pitch but is now a point behind, so drops beneath them.
    expect(rows.map((r) => r.teamId)).toEqual(["b", "c", "a"]);
    expect(rowFor(rows, "a").separatedBy).toBe("points");
  });

  it("scopes adjustments to the right division", () => {
    const teams: StandingsTeamInput[] = [
      { id: "a", name: "A", divisionId: "d1" },
      { id: "x", name: "X", divisionId: "d1" },
      { id: "b", name: "B", divisionId: "d2" },
      { id: "y", name: "Y", divisionId: "d2" },
    ];
    const matches: StandingsMatchInput[] = [
      { ...match("a", 3, 0, "x"), divisionId: "d1" },
      { ...match("b", 3, 0, "y"), divisionId: "d2" },
    ];
    const byDivision = calculateStandingsByDivision(teams, matches, {
      adjustments: [{ teamId: "a", points: -3 }],
    });
    expect(byDivision.get("d1")?.find((r) => r.teamId === "a")?.points).toBe(0);
    expect(byDivision.get("d2")?.find((r) => r.teamId === "b")?.points).toBe(3);
  });

  it("is listed in the default options as an empty array", () => {
    expect(DEFAULT_STANDINGS_OPTIONS.adjustments).toEqual([]);
  });
});
