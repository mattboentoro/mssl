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
  "REPORT_SUBMITTED",
  "CONFIRMED",
  "POSTPONED",
  "CANCELLED",
  "FORFEIT",
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const matchStatusSchema = z.enum(MATCH_STATUSES);

export const MatchStatus = Object.fromEntries(MATCH_STATUSES.map((s) => [s, s])) as {
  [K in MatchStatus]: K;
};

export const GAME_REPORT_STATUSES = ["SUBMITTED", "CONFIRMED", "DISPUTED"] as const;
export type GameReportStatus = (typeof GAME_REPORT_STATUSES)[number];
export const gameReportStatusSchema = z.enum(GAME_REPORT_STATUSES);

export const GameReportStatus = Object.fromEntries(GAME_REPORT_STATUSES.map((s) => [s, s])) as {
  [K in GameReportStatus]: K;
};

/**
 * Cards are the only in-match incident the league records. Goalscorers are
 * deliberately not tracked: referees file the final score and any disciplinary
 * action, nothing more.
 */
export const CARD_TYPES = ["YELLOW", "RED"] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const cardTypeSchema = z.enum(CARD_TYPES);

export const CardType = Object.fromEntries(CARD_TYPES.map((s) => [s, s])) as {
  [K in CardType]: K;
};

/** Who issued a disciplinary action. */
export const DISCIPLINARY_SOURCES = ["REFEREE", "ADMIN"] as const;
export type DisciplinarySource = (typeof DISCIPLINARY_SOURCES)[number];
export const disciplinarySourceSchema = z.enum(DISCIPLINARY_SOURCES);

export const DOCUMENT_CATEGORIES = ["RULES", "FORMS", "POLICY", "OTHER"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  RULES: "Rules & competition",
  FORMS: "Forms",
  POLICY: "Policies",
  OTHER: "Other",
};

export const ROLES = ["public", "viewer", "referee", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: "Needs a referee",
  ASSIGNED: "Referee assigned",
  REPORT_SUBMITTED: "Report submitted",
  CONFIRMED: "Confirmed",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  FORFEIT: "Forfeit",
};

export const CARD_LABELS: Record<CardType, string> = {
  YELLOW: "Yellow card",
  RED: "Red card",
};

export const DISCIPLINARY_SOURCE_LABELS: Record<DisciplinarySource, string> = {
  REFEREE: "Match report",
  ADMIN: "League sanction",
};

/** Statuses whose fixture is finished and should never be self-assigned. */
export const CLOSED_MATCH_STATUSES: readonly MatchStatus[] = [
  "CANCELLED",
  "POSTPONED",
  "CONFIRMED",
  "FORFEIT",
];
