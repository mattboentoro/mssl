import { describe, expect, it } from "vitest";

import {
  FREE_AGENT_STATUSES,
  FREE_AGENT_STATUS_LABELS,
  OPEN_FREE_AGENT_STATUSES,
  PLAYER_POSITIONS,
  PLAYER_POSITION_LABELS,
} from "@/lib/enums";
import { freeAgentRequestSchema, freeAgentReviewSchema } from "@/lib/validation";

/** The minimum a player has to answer: the three required questions. */
const answers = {
  yearsExperience: "5",
  preferredPosition: "MIDFIELDER",
  preferredDivisionId: "",
  phone: "",
  notes: "",
};

describe("free-agent enums", () => {
  it("labels every position and status", () => {
    for (const position of PLAYER_POSITIONS) {
      expect(PLAYER_POSITION_LABELS[position]).toBeTruthy();
    }
    for (const status of FREE_AGENT_STATUSES) {
      expect(FREE_AGENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("treats only pending and contacted as still open", () => {
    // The submit action reopens anything outside this set, so a mistake here
    // would silently wipe an administrator's review note.
    expect([...OPEN_FREE_AGENT_STATUSES]).toEqual(["PENDING", "CONTACTED"]);
    for (const status of OPEN_FREE_AGENT_STATUSES) {
      expect(FREE_AGENT_STATUSES).toContain(status);
    }
  });
});

describe("freeAgentRequestSchema", () => {
  it("accepts the three required answers and coerces years", () => {
    const parsed = freeAgentRequestSchema.parse(answers);
    expect(parsed.yearsExperience).toBe(5);
    expect(parsed.preferredPosition).toBe("MIDFIELDER");
  });

  it("turns blank optional answers into null, not empty strings", () => {
    // Prisma stores these as nullable columns; "" would read back as a value.
    const parsed = freeAgentRequestSchema.parse(answers);
    expect(parsed.preferredDivisionId).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("keeps optional answers that were given", () => {
    const parsed = freeAgentRequestSchema.parse({
      ...answers,
      preferredDivisionId: "div_1",
      phone: "425-555-0148",
      notes: "Available Tuesdays.",
    });
    expect(parsed.preferredDivisionId).toBe("div_1");
    expect(parsed.phone).toBe("425-555-0148");
    expect(parsed.notes).toBe("Available Tuesdays.");
  });

  it("allows a complete beginner", () => {
    expect(freeAgentRequestSchema.parse({ ...answers, yearsExperience: "0" }).yearsExperience).toBe(
      0,
    );
  });

  it("rejects negative, fractional, absurd and non-numeric experience", () => {
    for (const yearsExperience of ["-1", "2.5", "61", "ages"]) {
      expect(freeAgentRequestSchema.safeParse({ ...answers, yearsExperience }).success).toBe(false);
    }
  });

  it("rejects a position that is not on the list", () => {
    expect(
      freeAgentRequestSchema.safeParse({ ...answers, preferredPosition: "SWEEPER" }).success,
    ).toBe(false);
    expect(freeAgentRequestSchema.safeParse({ ...answers, preferredPosition: "" }).success).toBe(
      false,
    );
  });

  it("accepts every position the form offers", () => {
    for (const preferredPosition of PLAYER_POSITIONS) {
      expect(
        freeAgentRequestSchema.parse({ ...answers, preferredPosition }).preferredPosition,
      ).toBe(preferredPosition);
    }
  });
});

describe("freeAgentReviewSchema", () => {
  it("accepts a status change with a note", () => {
    const parsed = freeAgentReviewSchema.parse({
      requestId: "req_1",
      status: "CONTACTED",
      reviewNote: "Passed to two captains.",
    });
    expect(parsed.status).toBe("CONTACTED");
    expect(parsed.reviewNote).toBe("Passed to two captains.");
  });

  it("clears a blank note rather than storing an empty string", () => {
    expect(
      freeAgentReviewSchema.parse({ requestId: "req_1", status: "PLACED", reviewNote: "" })
        .reviewNote,
    ).toBeNull();
  });

  it("requires a request id and a known status", () => {
    expect(freeAgentReviewSchema.safeParse({ requestId: "", status: "PLACED" }).success).toBe(
      false,
    );
    expect(freeAgentReviewSchema.safeParse({ requestId: "req_1", status: "MAYBE" }).success).toBe(
      false,
    );
  });
});
