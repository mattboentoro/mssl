import { describe, expect, it } from "vitest";

import {
  outstandingSuspensions,
  planAccumulationBans,
  playerKey,
  resolvePlayerSuspensions,
  resolveSuspensions,
  suspensionsForMatch,
  type AccumulationCard,
  type SuspensionInput,
  type TeamFixture,
} from "@/lib/suspensions";

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 18, 0, 0));

const yellow = (
  id: string,
  day: number,
  over: Partial<AccumulationCard> = {},
): AccumulationCard => ({
  id,
  gamesSuspended: null,
  suspensionReason: null,
  createdAt: at(day),
  ...over,
});

const fixture = (id: string, day: number, over: Partial<TeamFixture> = {}): TeamFixture => ({
  id,
  kickoffAt: at(day),
  eligible: true,
  played: false,
  ...over,
});

const ban = (id: string, over: Partial<SuspensionInput> = {}): SuspensionInput => ({
  id,
  teamId: "t1",
  playerName: "Sam Reed",
  games: 1,
  reason: "RED_CARD",
  originKickoffAt: at(1),
  createdAt: at(1),
  ...over,
});

describe("playerKey", () => {
  it("folds case and stray whitespace so one player stays one player", () => {
    expect(playerKey("t1", "  Sam   Reed ")).toBe(playerKey("t1", "sam reed"));
  });

  it("keeps the same name on two clubs apart", () => {
    expect(playerKey("t1", "Sam Reed")).not.toBe(playerKey("t2", "Sam Reed"));
  });
});

describe("planAccumulationBans", () => {
  it("bans nobody before the third yellow", () => {
    expect(planAccumulationBans([yellow("a", 1), yellow("b", 2)])).toEqual([]);
  });

  it("bans on the third yellow", () => {
    expect(planAccumulationBans([yellow("a", 1), yellow("b", 2), yellow("c", 3)])).toEqual([
      { id: "c", gamesSuspended: 1, suspensionReason: "ACCUMULATED_YELLOWS" },
    ]);
  });

  it("re-arms, so the sixth and ninth earn one too", () => {
    const cards = Array.from({ length: 9 }, (_, index) => yellow(`y${index}`, index + 1));
    expect(planAccumulationBans(cards).map((change) => change.id)).toEqual(["y2", "y5", "y8"]);
  });

  it("counts in the order the cards were filed, not the order supplied", () => {
    const changes = planAccumulationBans([yellow("c", 3), yellow("a", 1), yellow("b", 2)]);
    expect(changes.map((change) => change.id)).toEqual(["c"]);
  });

  it("says nothing when the rows already agree with the rule", () => {
    const cards = [
      yellow("a", 1),
      yellow("b", 2),
      yellow("c", 3, { gamesSuspended: 1, suspensionReason: "ACCUMULATED_YELLOWS" }),
    ];
    expect(planAccumulationBans(cards)).toEqual([]);
  });

  it("moves the ban when an earlier card is rescinded", () => {
    // "b" was the third and carried the ban; it has been withdrawn, so the card
    // that is now third has to pick the ban up and its successor drop it.
    const cards = [
      yellow("a", 1),
      yellow("c", 3, { gamesSuspended: 1, suspensionReason: "ACCUMULATED_YELLOWS" }),
      yellow("d", 4),
    ];
    expect(planAccumulationBans(cards)).toEqual([
      { id: "c", gamesSuspended: null, suspensionReason: null },
      { id: "d", gamesSuspended: 1, suspensionReason: "ACCUMULATED_YELLOWS" },
    ]);
  });

  it("leaves an administrator's decision alone", () => {
    const cards = [
      yellow("a", 1),
      yellow("b", 2),
      yellow("c", 3, { gamesSuspended: 4, suspensionReason: "LEAGUE_SANCTION" }),
      yellow("d", 4),
    ];
    // "c" keeps its four games, and the rule does not hand its slot to anyone.
    expect(planAccumulationBans(cards)).toEqual([]);
  });
});

describe("resolvePlayerSuspensions", () => {
  const schedule = [fixture("m1", 2), fixture("m2", 9), fixture("m3", 16), fixture("m4", 23)];

  it("takes the next fixture after the incident", () => {
    const [resolved] = resolvePlayerSuspensions([ban("s1")], schedule);
    expect(resolved.matchIds).toEqual(["m1"]);
    expect(resolved.served).toBe(0);
    expect(resolved.remaining).toBe(1);
  });

  it("covers consecutive fixtures for a multi-game ban", () => {
    const [resolved] = resolvePlayerSuspensions([ban("s1", { games: 3 })], schedule);
    expect(resolved.matchIds).toEqual(["m1", "m2", "m3"]);
  });

  it("steps over a called-off fixture", () => {
    const called = [fixture("m1", 2, { eligible: false }), fixture("m2", 9), fixture("m3", 16)];
    const [resolved] = resolvePlayerSuspensions([ban("s1", { games: 2 })], called);
    expect(resolved.matchIds).toEqual(["m2", "m3"]);
  });

  it("stacks two bans from the same fixture instead of overlapping them", () => {
    const resolved = resolvePlayerSuspensions(
      [
        ban("third-yellow", { reason: "ACCUMULATED_YELLOWS" }),
        ban("red", { reason: "RED_CARD", games: 2 }),
      ],
      schedule,
    );
    // Three games missed in total, each fixture claimed once. Which ban goes
    // first does not matter; that the player sits out three does.
    const byId = new Map(resolved.map((item) => [item.id, item.matchIds]));
    expect(byId.get("red")).toEqual(["m1", "m2"]);
    expect(byId.get("third-yellow")).toEqual(["m3"]);
  });

  it("counts a fixture with a result filed as served", () => {
    const played = [fixture("m1", 2, { played: true }), fixture("m2", 9)];
    const [resolved] = resolvePlayerSuspensions([ban("s1", { games: 2 })], played);
    expect(resolved.served).toBe(1);
    expect(resolved.remaining).toBe(1);
  });

  it("runs out of schedule without inventing fixtures", () => {
    const [resolved] = resolvePlayerSuspensions(
      [ban("s1", { games: 3, originKickoffAt: at(16) })],
      schedule,
    );
    expect(resolved.matchIds).toEqual(["m4"]);
    expect(resolved.games).toBe(3);
    expect(resolved.remaining).toBe(3);
  });

  it("dates a sanction with no fixture from when it was filed", () => {
    const [resolved] = resolvePlayerSuspensions(
      [ban("s1", { originKickoffAt: null, createdAt: at(10) })],
      schedule,
    );
    expect(resolved.matchIds).toEqual(["m3"]);
  });

  it("ignores a card reviewed and found to warrant no ban", () => {
    expect(resolvePlayerSuspensions([ban("s1", { games: 0 })], schedule)).toEqual([]);
  });
});

describe("resolveSuspensions", () => {
  it("serves each player's ban against their own club's schedule", () => {
    const fixturesByTeam = new Map([
      ["t1", [fixture("home1", 2), fixture("home2", 9)]],
      ["t2", [fixture("away1", 5)]],
    ]);
    const resolved = resolveSuspensions(
      [ban("s1"), ban("s2", { teamId: "t2", playerName: "Ada Cole" })],
      fixturesByTeam,
    );
    expect(resolved.map((item) => item.matchIds)).toEqual([["home1"], ["away1"]]);
  });

  it("stacks two spellings of one name rather than double-booking a fixture", () => {
    const fixturesByTeam = new Map([["t1", [fixture("m1", 2), fixture("m2", 9)]]]);
    const resolved = resolveSuspensions(
      [ban("s1", { playerName: "Sam Reed" }), ban("s2", { playerName: "  sam   reed " })],
      fixturesByTeam,
    );
    expect(resolved[0].matchIds).toEqual(["m1"]);
    expect(resolved[1].matchIds).toEqual(["m2"]);
  });

  it("holds a ban open when the club has no fixtures left", () => {
    const resolved = resolveSuspensions([ban("s1")], new Map());
    expect(resolved[0].matchIds).toEqual([]);
    expect(resolved[0].remaining).toBe(1);
  });
});

describe("reading a resolved set", () => {
  const schedule = [fixture("m1", 2, { played: true }), fixture("m2", 9)];
  // Two bans filed at the same moment are ordered by id, so "a-served" takes
  // the fixture already played and "b-pending" the one still to come.
  const resolved = resolvePlayerSuspensions([ban("a-served"), ban("b-pending")], schedule);

  it("drops a ban that has been served", () => {
    expect(outstandingSuspensions(resolved).map((item) => item.id)).toEqual(["b-pending"]);
  });

  it("finds who is ineligible for one fixture", () => {
    expect(suspensionsForMatch(resolved, "m2").map((item) => item.id)).toEqual(["b-pending"]);
    expect(suspensionsForMatch(resolved, "nope")).toEqual([]);
  });
});
