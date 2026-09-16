import type { SuspensionReason } from "./enums";

/**
 * Suspension rules.
 *
 * Every function here is pure: it takes cards and fixtures and returns what the
 * ban ought to be. Nothing reads the database or the clock, which is what makes
 * the rules testable and what lets the same code answer both "who is banned for
 * this fixture" and "what should we have written when that card was filed".
 *
 * Two rules produce a ban:
 *
 *   * Accumulated yellows. Every third yellow of a season is an automatic
 *     one-match ban, applied by the league with nobody in the loop. The count
 *     re-arms, so the sixth and ninth earn one too.
 *   * A red card, or a sanction raised outside any fixture. Neither has a fixed
 *     length, so an administrator decides and types a number in.
 *
 * Which fixtures a ban covers is worked out here rather than stored, so moving
 * a fixture moves the ban with it.
 */

/** Yellows needed for an automatic ban. The count re-arms at each multiple. */
export const YELLOW_CARDS_PER_BAN = 3;

/** How long the automatic yellow-accumulation ban runs. */
export const ACCUMULATION_BAN_GAMES = 1;

/**
 * Fold a free-text player name into a stable grouping key.
 *
 * The league keeps no squad lists, so a player is only ever a name a referee
 * typed. Case and stray whitespace vary between reports and must not split one
 * player into two.
 */
export function playerKey(teamId: string, playerName: string): string {
  return `${teamId}::${playerName.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

/* -------------------------------------------------------------------------- */
/* Yellow accumulation                                                        */
/* -------------------------------------------------------------------------- */

export interface AccumulationCard {
  id: string;
  gamesSuspended: number | null;
  suspensionReason: string | null;
  createdAt: Date;
}

export interface AccumulationChange {
  id: string;
  gamesSuspended: number | null;
  suspensionReason: SuspensionReason | null;
}

/**
 * Work out which of one player's yellows should carry the automatic ban, and
 * return only the rows that currently disagree with the rule.
 *
 * Recomputing the whole set rather than incrementing a counter is what makes
 * this safe to run after a card is rescinded: the ban simply moves to whichever
 * yellow is now third.
 *
 * Cards banned for another reason are left alone — a red card's length is an
 * administrator's decision and the accumulation rule has no business touching
 * it.
 */
export function planAccumulationBans(yellows: AccumulationCard[]): AccumulationChange[] {
  const ordered = [...yellows].sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  const changes: AccumulationChange[] = [];

  ordered.forEach((card, index) => {
    const isOwnedByRule =
      card.suspensionReason === "ACCUMULATED_YELLOWS" || card.suspensionReason === null;
    if (!isOwnedByRule) return;

    const earnsBan = (index + 1) % YELLOW_CARDS_PER_BAN === 0;
    const games = earnsBan ? ACCUMULATION_BAN_GAMES : null;
    const reason: SuspensionReason | null = earnsBan ? "ACCUMULATED_YELLOWS" : null;

    const alreadyCorrect =
      (card.gamesSuspended ?? null) === games && (card.suspensionReason ?? null) === reason;
    if (alreadyCorrect) return;

    changes.push({ id: card.id, gamesSuspended: games, suspensionReason: reason });
  });

  return changes;
}

/* -------------------------------------------------------------------------- */
/* Serving a ban                                                              */
/* -------------------------------------------------------------------------- */

export interface SuspensionInput {
  id: string;
  teamId: string;
  playerName: string;
  games: number;
  reason: SuspensionReason;
  /** Kickoff of the fixture the card came from. Null for standalone sanctions. */
  originKickoffAt: Date | null;
  /** When the record was filed, used to place sanctions with no fixture. */
  createdAt: Date;
}

export interface TeamFixture {
  id: string;
  kickoffAt: Date;
  /** Called-off fixtures cannot be sat out, so a ban steps over them. */
  eligible: boolean;
  /** A result has been filed, so this one has been served. */
  played: boolean;
}

export interface ResolvedSuspension {
  id: string;
  teamId: string;
  playerName: string;
  reason: SuspensionReason;
  games: number;
  /** Fixtures the ban covers, earliest first. */
  matchIds: string[];
  served: number;
  remaining: number;
}

/** Where a ban starts counting from. */
function originOf(suspension: SuspensionInput): Date {
  return suspension.originKickoffAt ?? suspension.createdAt;
}

/**
 * Map one player's bans onto the fixtures they sit out.
 *
 * Bans stack rather than overlap: a player who collects a third yellow and a
 * red in the same fixture misses the next two matches, not the same match
 * twice. That is why this takes every ban for a player at once — the second
 * cannot be placed without knowing where the first ended.
 */
export function resolvePlayerSuspensions(
  suspensions: SuspensionInput[],
  fixtures: TeamFixture[],
): ResolvedSuspension[] {
  const schedule = [...fixtures]
    .filter((fixture) => fixture.eligible)
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());

  const ordered = [...suspensions].sort((a, b) => {
    const byOrigin = originOf(a).getTime() - originOf(b).getTime();
    return byOrigin !== 0 ? byOrigin : a.id.localeCompare(b.id);
  });

  // Fixtures already claimed by an earlier ban, so the next one starts after.
  let cursor = 0;
  const resolved: ResolvedSuspension[] = [];

  for (const suspension of ordered) {
    if (suspension.games <= 0) continue;

    const origin = originOf(suspension).getTime();
    // The ban starts at the first fixture after the incident that no earlier
    // ban has already taken.
    let start = cursor;
    while (start < schedule.length && schedule[start].kickoffAt.getTime() <= origin) {
      start += 1;
    }

    const covered = schedule.slice(start, start + suspension.games);
    cursor = start + covered.length;

    const served = covered.filter((fixture) => fixture.played).length;

    resolved.push({
      id: suspension.id,
      teamId: suspension.teamId,
      playerName: suspension.playerName,
      reason: suspension.reason,
      games: suspension.games,
      matchIds: covered.map((fixture) => fixture.id),
      served,
      remaining: Math.max(0, suspension.games - served),
    });
  }

  return resolved;
}

/**
 * Resolve every ban in a season.
 *
 * `fixturesByTeam` supplies each club's schedule; a ban is only ever served
 * against the club the player was carded for.
 */
export function resolveSuspensions(
  suspensions: SuspensionInput[],
  fixturesByTeam: Map<string, TeamFixture[]>,
): ResolvedSuspension[] {
  const byPlayer = new Map<string, SuspensionInput[]>();
  for (const suspension of suspensions) {
    const key = playerKey(suspension.teamId, suspension.playerName);
    const bucket = byPlayer.get(key);
    if (bucket) bucket.push(suspension);
    else byPlayer.set(key, [suspension]);
  }

  const resolved: ResolvedSuspension[] = [];
  for (const bucket of byPlayer.values()) {
    const fixtures = fixturesByTeam.get(bucket[0].teamId) ?? [];
    resolved.push(...resolvePlayerSuspensions(bucket, fixtures));
  }

  return resolved;
}

/** Bans still to be served, soonest fixture first. */
export function outstandingSuspensions<T extends ResolvedSuspension>(resolved: T[]): T[] {
  return resolved
    .filter((suspension) => suspension.remaining > 0)
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}

/** Who is ineligible for a given fixture. */
export function suspensionsForMatch<T extends ResolvedSuspension>(
  resolved: T[],
  matchId: string,
): T[] {
  return resolved
    .filter((suspension) => suspension.matchIds.includes(matchId))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}
