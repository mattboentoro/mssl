import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";

import { handleMatchMutation } from "@/lib/api";
import { PUBLIC_CACHE_TAGS as TAGS } from "@/lib/public-cache";
import { AuthzError } from "@/lib/authz";
import {
  reviewScoreAppealAction,
  reviewRescheduleAction,
  reviewCaptainResultAdminAction,
} from "@/app/admin/workflows/actions";
import { acceptScoreAppeal } from "@/lib/score-appeals";
import { reviewRescheduleAsAdmin } from "@/lib/reschedules";
import { reviewCaptainResult } from "@/lib/captain-results";
import { createAnnouncementAction } from "@/app/admin/actions";
import { submitFreeAgentRequest, withdrawFreeAgentRequest } from "@/app/free-agents/actions";
import { placeFreeAgentAction } from "@/app/captain/free-agents/actions";
import { leaveRosterAction } from "@/app/roster/actions";
import { leaveRoster } from "@/lib/roster";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/authz", () => {
  const user = {
    id: "actor",
    appUserId: "actor",
    name: "Actor",
    email: "actor@example.test",
    isAdmin: true,
  };
  return {
    AuthzError: class extends Error {
      status = 403;
      code = "FORBIDDEN";
    },
    requireAdmin: vi.fn(async () => user),
    requireUser: vi.fn(async () => user),
    requireCaptain: vi.fn(async () => user),
    requirePlayer: vi.fn(async () => user),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    announcement: { create: vi.fn(async () => ({ id: "news" })) },
    freeAgentRequest: {
      findUnique: vi.fn(),
      create: vi.fn(async (input) => ({ id: "request", ...input.data })),
      delete: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/score-appeals", () => ({
  acceptScoreAppeal: vi.fn(),
  rejectScoreAppeal: vi.fn(),
  ScoreAppealError: class extends Error {},
}));
vi.mock("@/lib/reschedules", () => ({
  reviewRescheduleAsAdmin: vi.fn(),
  RescheduleError: class extends Error {},
}));
vi.mock("@/lib/captain-results", () => ({
  reviewCaptainResult: vi.fn(),
  CaptainResultError: class extends Error {},
}));
vi.mock("@/lib/roster", () => ({ leaveRoster: vi.fn(), RosterError: class extends Error {} }));
vi.mock("@/lib/captain-free-agents", () => ({
  placeFreeAgent: vi.fn(),
  CaptainFreeAgentError: class extends Error {},
}));
vi.mock("@/lib/free-agent-eligibility", () => ({
  requireFreeAgentEligibility: vi.fn(),
  FreeAgentEligibilityError: class extends Error {},
}));

const form = (data: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, value);
  return result;
};
const tags = () =>
  vi
    .mocked(revalidateTag)
    .mock.calls.map(([tag]) => tag)
    .sort();
const matchTags = [TAGS.matches, TAGS.standings, TAGS.discipline].sort();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public cache mutation boundaries", () => {
  it("invalidates only after a successful API write and never caches its response", async () => {
    let commit!: () => void;
    const response = handleMatchMutation(async () => {
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
      return { ok: true };
    });
    expect(revalidateTag).not.toHaveBeenCalled();
    commit();
    const result = await response;
    expect(await result.json()).toEqual({ ok: true });
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(tags()).toEqual(matchTags);
  });

  it("does not invalidate on authorization failure and keeps errors no-store", async () => {
    const response = await handleMatchMutation(async () => {
      throw new AuthzError("Denied", 403, "FORBIDDEN");
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    [reviewScoreAppealAction, acceptScoreAppeal],
    [reviewRescheduleAction, reviewRescheduleAsAdmin],
    [reviewCaptainResultAdminAction, reviewCaptainResult],
  ] as const)("invalidates match projections after workflow review %#", async (action, write) => {
    const result = await action(
      {},
      form({ decision: "approve", matchId: "m", requestId: "r", proposalId: "p", appealId: "a" }),
    );
    expect(result.ok).toBeDefined();
    expect(write).toHaveBeenCalledTimes(1);
    expect(tags()).toEqual(matchTags);
    expect(vi.mocked(write).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(revalidateTag).mock.invocationCallOrder[0],
    );
  });

  it("expires content alone after publishing an announcement", async () => {
    const result = await createAnnouncementAction(
      {},
      form({ title: "News", summary: "League news", body: "A public announcement for everyone." }),
    );
    expect(result).toEqual({ ok: "Announcement published." });
    expect(tags()).toEqual([TAGS.content]);
  });

  it("expires the free-agent domain after sign-up and withdrawal without caching a request", async () => {
    vi.mocked(prisma.freeAgentRequest.findUnique).mockResolvedValue(null);
    expect(
      (
        await submitFreeAgentRequest(
          {},
          form({ yearsExperience: "3", preferredPosition: "MIDFIELDER" }),
        )
      ).ok,
    ).toBeDefined();
    expect(tags()).toEqual([TAGS.freeAgents]);
    vi.clearAllMocks();
    vi.mocked(prisma.freeAgentRequest.findUnique).mockResolvedValue({
      id: "request",
      submittedById: "actor",
      submittedByName: "Actor",
      submittedByEmail: "actor@example.test",
      yearsExperience: 3,
      preferredPosition: "MIDFIELDER",
      preferredDivisionId: null,
      notes: null,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewNote: null,
      reviewedAt: null,
      reviewedByEmail: null,
    });
    expect((await withdrawFreeAgentRequest({}, new FormData())).ok).toBeDefined();
    expect(tags()).toEqual([TAGS.freeAgents]);
  });

  it("expires roster and free-agent projections after contact and membership changes", async () => {
    expect(
      (await placeFreeAgentAction({}, form({ requestId: "r", seasonId: "s", teamId: "t" }))).ok,
    ).toBeDefined();
    expect(tags()).toEqual(
      [TAGS.teams, TAGS.matches, TAGS.standings, TAGS.discipline, TAGS.freeAgents].sort(),
    );
    vi.clearAllMocks();
    expect((await leaveRosterAction({}, form({ membershipId: "membership" }))).ok).toBeDefined();
    expect(leaveRoster).toHaveBeenCalledTimes(1);
    expect(tags()).toEqual(
      [TAGS.teams, TAGS.matches, TAGS.standings, TAGS.discipline, TAGS.freeAgents].sort(),
    );
  });
});
