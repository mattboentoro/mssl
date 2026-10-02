import "server-only";

import fs from "node:fs";
import path from "node:path";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";

import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { PUBLIC_CACHE_SECONDS as TTL, PUBLIC_CACHE_TAGS as TAGS } from "@/lib/public-cache";
import { getStandingsForSeason } from "@/lib/queries";

// These caches contain only public DTOs. Shared/private query helpers remain uncached.
const readSeasons = unstable_cache(
  async () =>
    (
      await prisma.season.findMany({
        select: { id: true, name: true, slug: true, isActive: true, startsOn: true, endsOn: true },
        orderBy: [{ startsOn: "desc" }, { id: "asc" }],
      })
    ).map((season) => ({
      ...season,
      startsOn: season.startsOn.toISOString(),
      endsOn: season.endsOn.toISOString(),
    })),
  ["public-seasons-v1"],
  { tags: [TAGS.league], revalidate: TTL.reference },
);

export async function getPublicSeasons() {
  return (await readSeasons()).map((season) => ({
    ...season,
    startsOn: new Date(season.startsOn),
    endsOn: new Date(season.endsOn),
  }));
}

export async function resolvePublicSeason(slugOrId?: string) {
  const seasons = await getPublicSeasons();
  return (
    seasons.find((season) => season.id === slugOrId || season.slug === slugOrId) ??
    seasons.find((season) => season.isActive) ??
    seasons[0] ??
    null
  );
}

export const getPublicDivisions = unstable_cache(
  () =>
    prisma.division.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ["public-divisions-v1"],
  { tags: [TAGS.league, TAGS.freeAgents], revalidate: TTL.reference },
);

const PUBLIC_TEAM_SELECT = {
  id: true,
  name: true,
  slug: true,
  shortName: true,
  colorPrimary: true,
  colorAlternate: true,
  logoBlobName: true,
  division: { select: { id: true, name: true } },
  captains: {
    where: {
      revokedAt: null,
      OR: [{ season: { is: { isActive: true } } }, { seasonId: null }],
    },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.TeamSelect;

function publicTeam<T extends { logoBlobName: string | null }>(team: T) {
  const { logoBlobName, ...visible } = team;
  return { ...visible, hasLogo: Boolean(logoBlobName) };
}

export const getPublicTeams = unstable_cache(
  async () =>
    (
      await prisma.team.findMany({
        select: PUBLIC_TEAM_SELECT,
        orderBy: [{ division: { sortOrder: "asc" } }, { name: "asc" }],
      })
    ).map(publicTeam),
  ["public-teams-v1"],
  { tags: [TAGS.teams], revalidate: TTL.reference },
);

export const getPublicTeamDetail = unstable_cache(
  async (slugOrId: string) => {
    const team = await prisma.team.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
      select: PUBLIC_TEAM_SELECT,
    });
    return team ? publicTeam(team) : null;
  },
  ["public-team-detail-v1"],
  { tags: [TAGS.teams], revalidate: TTL.reference },
);

const TEAM_KIT_SELECT = {
  id: true,
  slug: true,
  name: true,
  shortName: true,
  colorPrimary: true,
  colorAlternate: true,
} as const;

const readMatches = unstable_cache(
  async (
    season: string,
    division: string,
    team: string,
    matchweek: string,
    from: string,
    until: string,
    unreported: boolean,
  ) => {
    const matches = await prisma.match.findMany({
      where: {
        ...(season ? { seasonId: season } : {}),
        ...(division ? { divisionId: division } : {}),
        ...(team ? { OR: [{ homeTeamId: team }, { awayTeamId: team }] } : {}),
        ...(matchweek ? { matchweek } : {}),
        ...(from || until
          ? {
              kickoffAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(until ? { lt: new Date(until) } : {}),
              },
            }
          : {}),
        ...(unreported ? { report: { is: null } } : {}),
      },
      select: {
        id: true,
        seasonId: true,
        status: true,
        kickoffAt: true,
        matchweek: true,
        venueName: true,
        homeKit: true,
        awayKit: true,
        homeTeam: { select: TEAM_KIT_SELECT },
        awayTeam: { select: TEAM_KIT_SELECT },
        division: { select: { id: true, name: true, slug: true } },
        report: {
          select: {
            status: true,
            homeScore: true,
            awayScore: true,
            homeForfeit: true,
            awayForfeit: true,
          },
        },
      },
      orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    });
    return matches.map((match) => ({ ...match, kickoffAt: match.kickoffAt.toISOString() }));
  },
  ["public-matches-v1"],
  { tags: [TAGS.matches], revalidate: TTL.live },
);

export interface PublicMatchFilters {
  season?: string;
  division?: string;
  team?: string;
  matchweek?: string;
  from?: Date;
  until?: Date;
  unreported?: boolean;
}

export async function getPublicMatches(filters: PublicMatchFilters = {}) {
  // Round down only the database/cache window; filter precisely below on every request.
  // Otherwise a new Date() key would turn every upcoming read into a cache miss.
  const from = filters.from
    ? new Date(Math.floor(filters.from.getTime() / 60_000) * 60_000).toISOString()
    : "";
  const matches = await readMatches(
    filters.season ?? "",
    filters.division ?? "",
    filters.team ?? "",
    filters.matchweek ?? "",
    from,
    filters.until?.toISOString() ?? "",
    filters.unreported ?? false,
  );
  return matches
    .map((match) => ({ ...match, kickoffAt: new Date(match.kickoffAt) }))
    .filter((match) => !filters.from || match.kickoffAt >= filters.from);
}

export const getPublicStandings = unstable_cache(
  getStandingsForSeason,
  ["public-standings-v1", JSON.stringify(config.standings)],
  { tags: [TAGS.standings], revalidate: TTL.live },
);

const readDiscipline = unstable_cache(
  async (seasonId: string, teamId: string) => {
    const records = await prisma.disciplinaryAction.findMany({
      where: { seasonId, teamId },
      select: {
        id: true,
        playerName: true,
        type: true,
        createdAt: true,
        match: {
          select: {
            matchweek: true,
            homeTeam: { select: { shortName: true } },
            awayTeam: { select: { shortName: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return records.map(({ match, createdAt, ...record }) => ({
      ...record,
      createdAt: createdAt.toISOString(),
      matchLabel: match
        ? `MW${match.matchweek} ${match.homeTeam.shortName} v ${match.awayTeam.shortName}`
        : null,
    }));
  },
  ["public-team-discipline-v1"],
  { tags: [TAGS.discipline], revalidate: TTL.live },
);

export async function getPublicTeamDiscipline(seasonId: string, teamId: string) {
  return (await readDiscipline(seasonId, teamId)).map((record) => ({
    ...record,
    createdAt: new Date(record.createdAt),
  }));
}

const readAnnouncements = unstable_cache(
  async (take: number) => {
    const rows = await prisma.announcement.findMany({
      select: {
        id: true,
        title: true,
        summary: true,
        body: true,
        pinned: true,
        publishedAt: true,
        authorName: true,
      },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take,
    });
    return rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() }));
  },
  ["public-announcements-v1"],
  { tags: [TAGS.content], revalidate: TTL.reference },
);

export async function getPublicAnnouncements(take = 6) {
  return (await readAnnouncements(take)).map((row) => ({
    ...row,
    publishedAt: new Date(row.publishedAt),
  }));
}

export const isPublicRulesPublished = unstable_cache(
  async () =>
    fs.existsSync(
      path.join(process.cwd(), "public", "documents", "mssl-rules-and-regulations.pdf"),
    ),
  ["public-rules-published-v1"],
  { tags: [TAGS.content], revalidate: TTL.live },
);
