import { describe, expect, it } from "vitest";

import { teamSchema } from "../src/lib/validation";

const team = {
  divisionId: "division-1",
  name: "Test United",
  slug: "test-united",
  shortName: "TEST",
  colorPrimary: "#0f766e",
  colorAlternate: "#ffffff",
};

describe("team captains", () => {
  it("requires at least one captain", () => {
    const result = teamSchema.safeParse({ ...team, captains: [] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("A team must have at least 1 captain.");
    }
  });

  it("accepts up to five independently-addressable captains", () => {
    const captains = Array.from({ length: 5 }, (_, index) => ({
      name: `Captain ${index + 1}`,
      email: index === 0 ? "captain@example.com" : "",
    }));

    const result = teamSchema.safeParse({ ...team, captains });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.captains).toHaveLength(5);
      expect(result.data.captains[0]?.email).toBe("captain@example.com");
      expect(result.data.captains[1]?.email).toBeUndefined();
    }
  });

  it("refuses a sixth captain", () => {
    const captains = Array.from({ length: 6 }, (_, index) => ({
      name: `Captain ${index + 1}`,
      email: "",
    }));

    const result = teamSchema.safeParse({ ...team, captains });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("A team can have at most 5 captains.");
    }
  });
});
