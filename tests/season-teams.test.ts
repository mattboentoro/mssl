import { describe, expect, it } from "vitest";

import { buildSeasonDivisionMap, resolveDivisionId } from "@/lib/season-teams";

describe("resolveDivisionId", () => {
  it("prefers the division recorded against the season", () => {
    expect(resolveDivisionId("first", "premier")).toBe("first");
  });

  it("falls back to where the club plays today", () => {
    expect(resolveDivisionId(null, "premier")).toBe("premier");
    expect(resolveDivisionId(undefined, "premier")).toBe("premier");
  });
});

describe("buildSeasonDivisionMap", () => {
  const teams = [
    { id: "united", divisionId: "premier" },
    { id: "rovers", divisionId: "first" },
    { id: "athletic", divisionId: "first" },
  ];

  it("covers every club, entry or not", () => {
    const map = buildSeasonDivisionMap(teams, []);
    expect([...map.keys()].sort()).toEqual(["athletic", "rovers", "united"]);
  });

  it("keeps a promoted club in the division it actually played in", () => {
    // Rovers have since gone up, so Team.divisionId now reads "premier" --
    // but this season they were pinned to the first division.
    const promoted = [
      { id: "united", divisionId: "premier" },
      { id: "rovers", divisionId: "premier" },
      { id: "athletic", divisionId: "first" },
    ];
    const map = buildSeasonDivisionMap(promoted, [{ teamId: "rovers", divisionId: "first" }]);

    expect(map.get("rovers")).toBe("first");
    expect(map.get("united")).toBe("premier");
    expect(map.get("athletic")).toBe("first");
  });

  it("ignores entries for clubs that no longer exist", () => {
    const map = buildSeasonDivisionMap(teams, [{ teamId: "dissolved", divisionId: "premier" }]);
    expect(map.has("dissolved")).toBe(false);
  });
});
