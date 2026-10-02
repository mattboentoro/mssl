import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  vi.stubGlobal("AsyncLocalStorage", AsyncLocalStorage);
  return {
    entries: new Map<
      string,
      {
        value: { kind: string; data: { body: string }; revalidate: number };
        tags: string[];
        stored: number;
      }
    >(),
    reads: [] as { key: string; tags: string[]; revalidate: number }[],
    now: 0,
    db: {
      season: { findMany: vi.fn() },
      division: { findMany: vi.fn() },
      team: { findMany: vi.fn(), findFirst: vi.fn() },
      match: { findMany: vi.fn() },
      disciplinaryAction: { findMany: vi.fn() },
      announcement: { findMany: vi.fn() },
    },
    standings: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: harness.db }));
vi.mock("@/lib/queries", () => ({ getStandingsForSeason: harness.standings }));
vi.mock("next/cache", async (original) => ({
  ...(await original<typeof import("next/cache")>()),
  revalidateTag: vi.fn((tag: string) => {
    for (const [key, entry] of harness.entries) {
      if (entry.tags.includes(tag)) harness.entries.delete(key);
    }
  }),
}));

import { revalidateTag } from "next/cache";
import { invalidatePublicData, PUBLIC_CACHE_TAGS as TAGS } from "@/lib/public-cache";
import {
  getPublicAnnouncements,
  getPublicDivisions,
  getPublicMatches,
  getPublicSeasons,
  getPublicStandings,
  getPublicTeamDetail,
  getPublicTeamDiscipline,
  getPublicTeams,
  isPublicRulesPublished,
  resolvePublicSeason,
} from "@/lib/public-queries";

// Exercise the installed unstable_cache, including its real key generation and
// JSON round-trip, with a deterministic in-memory Incremental Cache adapter.
beforeEach(() => {
  vi.clearAllMocks();
  harness.entries.clear();
  harness.reads.length = 0;
  harness.now = 0;
  vi.stubGlobal("__incrementalCache", {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string, context: { tags: string[]; revalidate: number }) => {
      harness.reads.push({ key, tags: context.tags, revalidate: context.revalidate });
      const entry = harness.entries.get(key);
      return entry
        ? { value: entry.value, isStale: harness.now - entry.stored >= context.revalidate * 1000 }
        : null;
    },
    set: async (
      key: string,
      value: { kind: string; data: { body: string }; revalidate: number },
      context: { tags: string[] },
    ) => {
      harness.entries.set(key, { value, tags: context.tags, stored: harness.now });
    },
  });
  harness.db.season.findMany.mockResolvedValue([
    {
      id: "old",
      slug: "old-season",
      name: "Old",
      isActive: false,
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
    {
      id: "active",
      slug: "active-season",
      name: "Active",
      isActive: true,
      startsOn: new Date("2025-01-01"),
      endsOn: new Date("2025-12-31"),
    },
  ]);
  harness.db.division.findMany.mockResolvedValue([{ id: "d", name: "Premier", slug: "premier" }]);
  harness.db.team.findMany.mockResolvedValue([]);
  harness.db.team.findFirst.mockResolvedValue(null);
  harness.db.match.findMany.mockResolvedValue([]);
  harness.db.disciplinaryAction.findMany.mockResolvedValue([]);
  harness.db.announcement.findMany.mockResolvedValue([]);
  harness.standings.mockResolvedValue([]);
});

describe("public Data Cache reads", () => {
  it("reuses season/division data and restores dates identically after JSON cache hits", async () => {
    const first = await getPublicSeasons();
    expect(await getPublicSeasons()).toEqual(first);
    expect((await getPublicSeasons())[0].startsOn).toBeInstanceOf(Date);
    expect((await resolvePublicSeason("old-season"))?.id).toBe("old");
    expect((await resolvePublicSeason("active"))?.id).toBe("active");
    expect((await resolvePublicSeason("missing"))?.id).toBe("active");
    expect(harness.db.season.findMany).toHaveBeenCalledTimes(1);
    await getPublicDivisions();
    await getPublicDivisions();
    expect(harness.db.division.findMany).toHaveBeenCalledTimes(1);
    expect(harness.reads.at(-1)).toMatchObject({
      tags: [TAGS.league, TAGS.freeAgents],
      revalidate: 300,
    });
  });

  it("normalizes object property order and omitted defaults into stable argument keys", async () => {
    await getPublicMatches({ team: "t", season: "s", division: "d" });
    await getPublicMatches({ division: "d", season: "s", team: "t", unreported: false });
    expect(harness.db.match.findMany).toHaveBeenCalledTimes(1);
    expect(harness.reads[0].key).toBe(harness.reads[1].key);
    expect(harness.reads[0]).toMatchObject({ tags: [TAGS.matches], revalidate: 60 });
  });

  it("includes every database filter and time bound in the key", async () => {
    const filters = {
      season: "s",
      division: "d",
      team: "t",
      matchweek: "Final",
      from: new Date("2026-10-01"),
      until: new Date("2026-11-01"),
      unreported: true,
    };
    await getPublicMatches(filters);
    for (const change of [
      { season: "s2" },
      { division: "d2" },
      { team: "t2" },
      { matchweek: "Semi" },
      { from: new Date("2026-10-02") },
      { until: new Date("2026-12-01") },
      { unreported: false },
    ])
      await getPublicMatches({ ...filters, ...change });
    expect(harness.db.match.findMany).toHaveBeenCalledTimes(8);
    expect(new Set(harness.reads.map((read) => read.key)).size).toBe(8);
    expect(harness.db.match.findMany.mock.calls[0][0].where).toEqual({
      seasonId: "s",
      divisionId: "d",
      OR: [{ homeTeamId: "t" }, { awayTeamId: "t" }],
      matchweek: "Final",
      kickoffAt: { gte: filters.from, lt: filters.until },
      report: { is: null },
    });
  });

  it("shares upcoming minute windows without showing already-started fixtures", async () => {
    harness.db.match.findMany.mockResolvedValue([
      { id: "early", kickoffAt: new Date("2026-10-01T12:00:10Z") },
      { id: "later", kickoffAt: new Date("2026-10-01T12:00:50Z") },
    ]);
    const early = await getPublicMatches({ from: new Date("2026-10-01T12:00:05Z") });
    const later = await getPublicMatches({ from: new Date("2026-10-01T12:00:20Z") });
    expect(early.map((match) => match.id)).toEqual(["early", "later"]);
    expect(later.map((match) => match.id)).toEqual(["later"]);
    expect(later[0].kickoffAt).toBeInstanceOf(Date);
    expect(harness.db.match.findMany).toHaveBeenCalledTimes(1);
  });

  it("keys team detail, team discipline, standings, and announcements by all their inputs", async () => {
    for (const team of ["a", "b", "a"]) await getPublicTeamDetail(team);
    for (const [season, team] of [
      ["s", "a"],
      ["s", "b"],
      ["s2", "a"],
      ["s", "a"],
    ]) {
      await getPublicTeamDiscipline(season, team);
    }
    for (const season of ["s", "s2", "s"]) await getPublicStandings(season);
    for (const count of [4, 6, 4]) await getPublicAnnouncements(count);
    expect(harness.db.team.findFirst).toHaveBeenCalledTimes(2);
    expect(harness.db.disciplinaryAction.findMany).toHaveBeenCalledTimes(3);
    expect(harness.standings).toHaveBeenCalledTimes(2);
    expect(harness.db.announcement.findMany).toHaveBeenCalledTimes(2);
  });

  it("caches only the public profile projection and no permission/contact/fixture notes", async () => {
    harness.db.team.findMany.mockResolvedValue([
      {
        id: "t",
        name: "Team",
        logoBlobName: "private-blob-pointer",
        captains: [{ id: "c", name: "Captain" }],
      },
    ]);
    const [team] = await getPublicTeams();
    expect(team.hasLogo).toBe(true);
    expect(team).not.toHaveProperty("logoBlobName");
    expect(harness.db.team.findMany.mock.calls[0][0].select.captains.select).toEqual({
      id: true,
      name: true,
    });
    await getPublicMatches();
    const select = harness.db.match.findMany.mock.calls[0][0].select;
    for (const privateField of ["referee", "refereeId", "notes", "assignedAt"])
      expect(select).not.toHaveProperty(privateField);
    expect(select.report.select).not.toHaveProperty("notes");
    expect(harness.entries.values().next().value?.value.data.body).not.toContain(
      "private-blob-pointer",
    );
  });

  it("stores serializable public records and restores dates for consumers", async () => {
    harness.db.disciplinaryAction.findMany.mockResolvedValue([
      {
        id: "card",
        playerName: "Player",
        type: "YELLOW",
        createdAt: new Date("2026-10-01"),
        match: null,
      },
    ]);
    harness.db.announcement.findMany.mockResolvedValue([
      { id: "news", publishedAt: new Date("2026-10-01") },
    ]);
    const cards = await getPublicTeamDiscipline("s", "t");
    const announcements = await getPublicAnnouncements();
    expect(await getPublicTeamDiscipline("s", "t")).toEqual(cards);
    expect(await getPublicAnnouncements()).toEqual(announcements);
    expect(cards[0].createdAt).toBeInstanceOf(Date);
    expect(announcements[0].publishedAt).toBeInstanceOf(Date);
  });

  it("uses bounded TTLs and invalidates affected domains without evicting unrelated content", async () => {
    await getPublicMatches();
    await getPublicStandings("s");
    await getPublicAnnouncements();
    invalidatePublicData("matches");
    expect(revalidateTag).toHaveBeenCalledWith(TAGS.matches, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(TAGS.standings, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(TAGS.discipline, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    await getPublicMatches();
    await getPublicStandings("s");
    await getPublicAnnouncements();
    expect(harness.db.match.findMany).toHaveBeenCalledTimes(2);
    expect(harness.standings).toHaveBeenCalledTimes(2);
    expect(harness.db.announcement.findMany).toHaveBeenCalledTimes(1);
    harness.now = 61_000;
    await getPublicMatches();
    await getPublicAnnouncements();
    expect(harness.db.match.findMany).toHaveBeenCalledTimes(3);
    expect(harness.db.announcement.findMany).toHaveBeenCalledTimes(1);
    harness.now = 301_000;
    await getPublicAnnouncements();
    expect(harness.db.announcement.findMany).toHaveBeenCalledTimes(2);
  });

  it("deduplicates dependencies, expires free-agent reference data, and tags rules availability", async () => {
    await getPublicDivisions();
    invalidatePublicData("teams", "matches", "freeAgents");
    expect(revalidateTag).toHaveBeenCalledTimes(5);
    await getPublicDivisions();
    expect(harness.db.division.findMany).toHaveBeenCalledTimes(2);
    await isPublicRulesPublished();
    expect(harness.reads.at(-1)).toMatchObject({ tags: [TAGS.content], revalidate: 60 });
    invalidatePublicData("league");
    for (const tag of Object.values(TAGS))
      expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
  });
});
