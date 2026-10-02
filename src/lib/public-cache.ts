import "server-only";

import { revalidateTag } from "next/cache";

export const PUBLIC_CACHE_TAGS = {
  league: "public:league",
  matches: "public:matches",
  standings: "public:standings",
  teams: "public:teams",
  discipline: "public:discipline",
  content: "public:content",
  freeAgents: "public:free-agents",
} as const;

export const PUBLIC_CACHE_SECONDS = { live: 60, reference: 300 } as const;
export type PublicCacheDomain = keyof typeof PUBLIC_CACHE_TAGS;

const DEPENDENCIES: Record<PublicCacheDomain, readonly PublicCacheDomain[]> = {
  league: ["league", "matches", "standings", "teams", "discipline", "content", "freeAgents"],
  matches: ["matches", "standings", "discipline"],
  standings: ["standings"],
  teams: ["teams", "matches", "standings", "discipline"],
  discipline: ["discipline", "standings"],
  content: ["content"],
  freeAgents: ["freeAgents"],
};

/** Call after a successful commit, never inside a database transaction or cached read. */
export function invalidatePublicData(...domains: PublicCacheDomain[]) {
  const affected = new Set(domains.flatMap((domain) => DEPENDENCIES[domain]));
  for (const domain of affected) {
    // Unlike "max", expire: 0 does not serve pre-mutation data on the next read.
    // This API works in both Server Actions and mutation Route Handlers.
    revalidateTag(PUBLIC_CACHE_TAGS[domain], { expire: 0 });
  }
}
