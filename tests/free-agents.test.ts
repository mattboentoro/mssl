import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FREE_AGENT_STATUSES,
  FREE_AGENT_STATUS_LABELS,
  OPEN_FREE_AGENT_STATUSES,
  PLAYER_POSITIONS,
  PLAYER_POSITION_LABELS,
} from "@/lib/enums";
import { freeAgentRequestSchema } from "@/lib/validation";

/** The minimum a player has to answer: the three required questions. */
const answers = {
  yearsExperience: "5",
  preferredPosition: "MIDFIELDER",
  preferredDivisionId: "",
  notes: "",
};
const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("free-agent enums", () => {
  it("labels every position and status", () => {
    for (const position of PLAYER_POSITIONS) {
      expect(PLAYER_POSITION_LABELS[position]).toBeTruthy();
    }
    for (const status of FREE_AGENT_STATUSES) {
      expect(FREE_AGENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("offers only system-managed not-placed and contacted states", () => {
    expect([...FREE_AGENT_STATUSES]).toEqual(["PENDING", "CONTACTED"]);
    expect([...OPEN_FREE_AGENT_STATUSES]).toEqual(["PENDING", "CONTACTED"]);
    expect(FREE_AGENT_STATUS_LABELS.PENDING).toBe("Not placed");
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
    expect(parsed.notes).toBeNull();
  });

  it("keeps optional answers that were given", () => {
    const parsed = freeAgentRequestSchema.parse({
      ...answers,
      preferredDivisionId: "div_1",
      notes: "Available Tuesdays.",
    });
    expect(parsed.preferredDivisionId).toBe("div_1");
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

describe("free-agent list UI", () => {
  it("uses compact disclosures with system status and no manual review controls", () => {
    const disclosure = source("src/components/free-agent-disclosure.tsx");
    const adminPage = source("src/app/admin/free-agents/page.tsx");
    const captainPage = source("src/app/captain/free-agents/page.tsx");

    expect(disclosure).toContain('as="details"');
    expect(disclosure).toContain("Experience");
    expect(disclosure).toContain("Position");
    expect(disclosure).toContain("Division");
    expect(disclosure).toContain("Teams that reached out");
    expect(adminPage).not.toContain("reviewFreeAgentRequest");
    expect(adminPage).not.toContain('name="reviewNote"');
    expect(adminPage).not.toContain('name="status" value=');
    expect(captainPage).not.toContain('name="message"');
    expect(captainPage).not.toContain('name="status"');
    expect(captainPage).toContain("showStatus={false}");
    expect(captainPage).toContain("showContactHistory={false}");
    expect(captainPage).toContain('variant="primary"');
  });
});
