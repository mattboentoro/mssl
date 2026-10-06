import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";

import AdminMatchesPage from "@/app/admin/matches/page";
import AdminDisciplinePage from "@/app/admin/discipline/page";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { getDisciplinaryRecords } from "@/lib/queries";
import { zonedToUtc } from "@/lib/timezone";

vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/actions", () => ({
  createMatchAction: vi.fn(),
  createDisciplinaryAction: vi.fn(),
  deleteDisciplinaryActionAction: vi.fn(),
  setSuspensionAction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((queries) => Promise.all(queries)),
    season: { findMany: vi.fn(), findFirst: vi.fn() },
    division: { findMany: vi.fn() },
    team: { findMany: vi.fn() },
    match: { findMany: vi.fn(), count: vi.fn() },
    disciplinaryAction: { findMany: vi.fn(), count: vi.fn() },
    rescheduleRequest: { count: vi.fn() },
    captainResultProposal: { count: vi.fn() },
    scoreAppeal: { count: vi.fn() },
  },
}));

function findPagination(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(findPagination).find(Boolean) ?? null;
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  return node.type === Pagination ? node : findPagination(node.props.children);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Only the IDs are needed by the page when each list is empty.
  vi.mocked(prisma.season.findMany).mockResolvedValue([]);
  vi.mocked(prisma.season.findFirst).mockResolvedValue({
    id: "fall",
    name: "Fall",
    slug: "fall",
    startsOn: new Date(),
    endsOn: new Date(),
    isActive: true,
    tiebreakerMode: "POINTS",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  vi.mocked(prisma.division.findMany).mockResolvedValue([]);
  vi.mocked(prisma.team.findMany).mockResolvedValue([]);
  vi.mocked(prisma.match.findMany).mockResolvedValue([]);
  vi.mocked(prisma.match.count).mockResolvedValue(251);
  vi.mocked(prisma.disciplinaryAction.findMany).mockResolvedValue([]);
  vi.mocked(prisma.disciplinaryAction.count).mockResolvedValue(251);
  vi.mocked(prisma.rescheduleRequest.count).mockResolvedValue(0);
  vi.mocked(prisma.captainResultProposal.count).mockResolvedValue(0);
  vi.mocked(prisma.scoreAppeal.count).mockResolvedValue(0);
});

describe("admin paged queries", () => {
  it("counts filtered fixtures then fetches only page two in a stable order", async () => {
    const params = {
      page: "2",
      season: "fall",
      division: "d1",
      q: "A&B",
      status: "CANCELLED",
      when: "all",
      sort: "custom",
    };
    const tree = await AdminMatchesPage({ searchParams: Promise.resolve(params) });
    const count = vi.mocked(prisma.match.count).mock.calls[0][0];
    expect(count?.where).toMatchObject({
      seasonId: "fall",
      divisionId: "d1",
      OR: [
        { homeTeam: { name: { contains: "A&B" } } },
        { awayTeam: { name: { contains: "A&B" } } },
      ],
    });
    expect(count?.where?.AND).toBeDefined();
    expect(prisma.match.findMany).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: count?.where,
        skip: 100,
        take: 100,
        orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(findPagination(tree)).toMatchObject({
      props: { params, range: { page: 2, total: 251 } },
    });
  });

  it.each([
    ["999", 200],
    ["-1", 0],
    ["bad", 0],
  ])("clamps fixture page %s before querying", async (page, skip) => {
    await AdminMatchesPage({ searchParams: Promise.resolve({ page }) });
    expect(prisma.match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip, take: 100 }),
    );
  });

  it("loads the whole selected calendar month without a list fetch, count, or pagination", async () => {
    const tree = await AdminMatchesPage({
      searchParams: Promise.resolve({
        page: "99",
        view: "calendar",
        month: "2026-10",
        when: "upcoming",
        division: "d1",
      }),
    });
    expect(prisma.match.count).not.toHaveBeenCalled();
    expect(prisma.match.findMany).toHaveBeenCalledTimes(1);
    const query = vi.mocked(prisma.match.findMany).mock.calls[0][0];
    expect(query?.where).toMatchObject({
      seasonId: "fall",
      divisionId: "d1",
      kickoffAt: {
        gte: zonedToUtc(2026, 10, 1),
        lt: zonedToUtc(2026, 11, 1),
      },
    });
    expect(query).not.toHaveProperty("take");
    expect(query).not.toHaveProperty("skip");
    expect(findPagination(tree)).toBeNull();
  });

  it("paginates the disciplinary register without truncating review queues or suspensions", async () => {
    const params = { season: "fall", page: "2", q: "preserved", sort: "preserved" };
    const tree = await AdminDisciplinePage({ searchParams: Promise.resolve(params) });
    expect(prisma.disciplinaryAction.count).toHaveBeenCalledExactlyOnceWith({
      where: { seasonId: "fall" },
    });
    expect(prisma.disciplinaryAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: "fall" },
        skip: 100,
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(prisma.disciplinaryAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: "fall", type: "RED", gamesSuspended: null },
        take: undefined,
        skip: undefined,
      }),
    );
    expect(prisma.disciplinaryAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: "fall", gamesSuspended: { gt: 0 } },
      }),
    );
    expect(findPagination(tree)).toMatchObject({
      props: { params, range: { page: 2, total: 251 } },
    });
  });

  it("keeps the shared unpaged disciplinary query backwards compatible", async () => {
    await getDisciplinaryRecords("fall");
    expect(prisma.disciplinaryAction.findMany).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: { seasonId: "fall" },
        take: undefined,
        skip: undefined,
      }),
    );
  });
});
