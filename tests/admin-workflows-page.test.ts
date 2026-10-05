import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import AdminWorkflowsPage from "@/app/admin/workflows/page";
import { prisma } from "@/lib/prisma";

vi.mock("@/app/admin/workflows/actions", () => ({
  reviewCaptainResultAdminAction: vi.fn(),
  reviewRescheduleAction: vi.fn(),
  reviewScoreAppealAction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rescheduleRequest: { findMany: vi.fn().mockResolvedValue([]) },
    captainResultProposal: { findMany: vi.fn().mockResolvedValue([]) },
    scoreAppeal: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Admin workflow reviews", () => {
  it("uses exact status filters and oldest-first ordering supported by the queue indexes", async () => {
    await AdminWorkflowsPage();
    for (const [query, status] of [
      [prisma.rescheduleRequest.findMany, "PENDING_ADMIN"],
      [prisma.captainResultProposal.findMany, "PENDING_ADMIN"],
      [prisma.scoreAppeal.findMany, "PENDING"],
    ] as const) {
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ where: { status }, orderBy: { createdAt: "asc" } }),
      );
    }
  });

  it("shows score appeals as distinct current, original, and requested panels", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/admin/workflows/page.tsx"),
      "utf8",
    );

    expect(page).toContain('tone: "current" | "original" | "requested"');
    expect(page).toContain('label="Current official"');
    expect(page).toContain('label="Original snapshot"');
    expect(page).toContain('label="Requested correction"');
    expect(page).toContain("border-brand/35 bg-brand/5");
    expect(page).toContain("border-warning/40 bg-warning/10");
    expect(page).toContain("border-success/40 bg-success/10");
    expect(page).toContain("text-2xl font-bold tabular-nums");
    expect(page).toContain("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
    expect(page).toContain("summary={");
    expect(page).toContain("Score appeal");
    expect(page).toContain("appeal.match.matchweek");
    expect(page).toContain("appeal.match.venueName");
  });
});
