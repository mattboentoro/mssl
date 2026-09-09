import { z } from "zod";

/**
 * Enum-like value sets.
 *
 * These are plain string unions rather than Prisma enums because the schema has
 * to run on SQLite locally (Prisma's SQLite connector has no `enum` support) and
 * on PostgreSQL in production. Every enum-ish column is validated here instead.
 */

export const MATCH_STATUSES = [
  "SCHEDULED",
  "ASSIGNED",
  "LOCKED",
  "REPORT_SUBMITTED",
  "CONFIRMED",
  "POSTPONED",
  "CANCELLED",
  "FORFEIT",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const matchStatusSchema = z.enum(MATCH_STATUSES);

export const MatchStatus = Object.fromEntries(
  MATCH_STATUSES.map((s) => [s, s]),
) as { [K in MatchStatus]: K };

export const GAME_REPORT_STATUSES = ["SUBMITTED", "CONFIRMED", "DISPUTED"] as const;
export type GameReportStatus = (typeof GAME_REPORT_STATUSES)[number];
export const gameReportStatusSchema = z.enum(GAME_REPORT_STATUSES);

export const GameReportStatus = Object.fromEntries(
  GAME_REPORT_STATUSES.map((s) => [s, s]),
) as { [K in GameReportStatus]: K };

export const GAME_EVENT_TYPES = [
  "GOAL",
  "OWN_GOAL",
  "PENALTY_GOAL",
  "YELLOW",
  "RED",
  "SUBSTITUTION",
] as const;
export type GameEventType = (typeof GAME_EVENT_TYPES)[number];
export const gameEventTypeSchema = z.enum(GAME_EVENT_TYPES);

export const GameEventType = Object.fromEntries(
  GAME_EVENT_TYPES.map((s) => [s, s]),
) as { [K in GameEventType]: K };

export const DOCUMENT_CATEGORIES = ["RULES", "FORMS", "POLICY", "OTHER"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export const ROLES = ["public", "viewer", "referee", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Event types that put the ball in the net for the *scoring* team. */
export const SCORING_EVENT_TYPES: readonly GameEventType[] = ["GOAL", "PENALTY_GOAL"];

/** Own goals count for the opposing team. */
export const isScoringEvent = (type: string): boolean =>
  SCORING_EVENT_TYPES.includes(type as GameEventType) || type === "OWN_GOAL";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: "Scheduled",
  ASSIGNED: "Referee assigned",
  LOCKED: "Locked",
  REPORT_SUBMITTED: "Report submitted",
  CONFIRMED: "Confirmed",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  FORFEIT: "Forfeit",
};

export const GAME_EVENT_LABELS: Record<GameEventType, string> = {
  GOAL: "Goal",
  OWN_GOAL: "Own goal",
  PENALTY_GOAL: "Penalty goal",
  YELLOW: "Yellow card",
  RED: "Red card",
  SUBSTITUTION: "Substitution",
};

/** Statuses whose fixture is finished and should never be self-assigned. */
export const CLOSED_MATCH_STATUSES: readonly MatchStatus[] = [
  "CANCELLED",
  "POSTPONED",
  "CONFIRMED",
  "FORFEIT",
];
