import { PassThrough } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminOverviewPage from "@/app/admin/page";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

vi.mock("@/lib/queries", () => ({ getActiveSeason: vi.fn(), displayedScore: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    season: { count: vi.fn() },
    team: { count: vi.fn() },
    disciplinaryAction: { count: vi.fn() },
    match: { count: vi.fn(), findMany: vi.fn() },
    gameReport: { count: vi.fn() },
    referee: { count: vi.fn() },
    auditLog: { findMany: vi.fn() },
    rescheduleRequest: { count: vi.fn() },
    captainResultProposal: { count: vi.fn() },
    scoreAppeal: { count: vi.fn() },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.season.count).mockResolvedValue(1);
  vi.mocked(prisma.team.count).mockResolvedValue(2);
  vi.mocked(prisma.disciplinaryAction.count).mockResolvedValue(3);
  vi.mocked(prisma.match.count).mockResolvedValue(4);
  vi.mocked(prisma.match.findMany).mockResolvedValue([]);
  vi.mocked(prisma.gameReport.count).mockResolvedValue(5);
  vi.mocked(prisma.referee.count).mockResolvedValue(6);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.rescheduleRequest.count).mockResolvedValue(7);
  vi.mocked(prisma.captainResultProposal.count).mockResolvedValue(8);
  vi.mocked(prisma.scoreAppeal.count).mockResolvedValue(9);
});

describe("admin overview streaming", () => {
  it("streams useful sections while league totals are blocked, without duplicate queries", async () => {
    let finishSeason!: (season: null) => void;
    vi.mocked(getActiveSeason).mockReturnValue(
      new Promise((resolve) => {
        finishSeason = resolve;
      }),
    );
    let output = "";
    const errors: unknown[] = [];
    const destination = new PassThrough();
    destination.on("data", (chunk) => {
      output += chunk.toString();
    });
    const ended = new Promise<void>((resolve) => destination.on("end", resolve));
    const stream = renderToPipeableStream(createElement(AdminOverviewPage), {
      onShellReady() {
        stream.pipe(destination);
      },
      onError(error) {
        errors.push(error);
      },
    });
    try {
      await vi.waitFor(() => {
        expect(output.replaceAll("<!-- -->", "")).toContain("Loading league totals...");
        expect(output).toContain("Nothing to review");
        expect(output).toContain("Agreed reschedules");
        expect(output).toContain("No activity recorded yet");
      });
      expect(output).not.toContain("Active season:");
      finishSeason(null);
      await ended;
      expect(output).toContain("Active season:");
      expect(errors).toEqual([]);
      expect(getActiveSeason).toHaveBeenCalledTimes(1);
      expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.match.count).toHaveBeenCalledTimes(2);
      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
      for (const model of [
        prisma.season,
        prisma.team,
        prisma.disciplinaryAction,
        prisma.gameReport,
        prisma.referee,
        prisma.rescheduleRequest,
        prisma.captainResultProposal,
        prisma.scoreAppeal,
      ]) {
        expect(model.count).toHaveBeenCalledTimes(1);
      }
    } finally {
      finishSeason(null);
      stream.abort();
      destination.destroy();
    }
  });
});
