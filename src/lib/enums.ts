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

/** Which of a team's two registered kits they wear for a given fixture. */
export const KIT_CHOICES = ["PRIMARY", "ALTERNATE"] as const;
export type KitChoice = (typeof KIT_CHOICES)[number];
export const kitChoiceSchema = z.enum(KIT_CHOICES);

export const KIT_LABELS: Record<KitChoice, string> = {
  PRIMARY: "Primary kit",
  ALTERNATE: "Alternate kit",
};

/** Who issued a disciplinary action. */
export const DISCIPLINARY_SOURCES = ["REFEREE", "ADMIN"] as const;
export type DisciplinarySource = (typeof DISCIPLINARY_SOURCES)[number];
export const disciplinarySourceSchema = z.enum(DISCIPLINARY_SOURCES);

/**
 * Why a player is banned.
 *
 * ACCUMULATED_YELLOWS is written by the league itself — every third yellow of a
 * season earns an automatic one-match ban, and the rule re-arms, so the sixth
 * and ninth do too. The other two are decisions a person makes: an
 * administrator reviewing a red card, or issuing a sanction outside any
 * fixture.
 */
export const SUSPENSION_REASONS = ["ACCUMULATED_YELLOWS", "RED_CARD", "LEAGUE_SANCTION"] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];
export const suspensionReasonSchema = z.enum(SUSPENSION_REASONS);

export const SUSPENSION_REASON_LABELS: Record<SuspensionReason, string> = {
  ACCUMULATED_YELLOWS: "Yellow card accumulation",
  RED_CARD: "Red card",
  LEAGUE_SANCTION: "League sanction",
};

export const DOCUMENT_CATEGORIES = ["RULES", "FORMS", "POLICY", "OTHER"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  RULES: "Rules & competition",
  FORMS: "Forms",
  POLICY: "Policies",
  OTHER: "Other",
};

export const ROLES = ["public", "viewer", "player", "captain", "referee", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ASSIGNABLE_ROLES = ["PLAYER", "CAPTAIN", "REFEREE", "ADMIN"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

/**
 * Where a free agent would rather play.
 *
 * Deliberately coarse. The league has no squad register, so this is a hint for
 * whichever captain ends up reading the request, not a position a player is
 * held to once they are placed.
 */
export const PLAYER_POSITIONS = ["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD", "ANY"] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];
export const playerPositionSchema = z.enum(PLAYER_POSITIONS);

export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  GOALKEEPER: "Goalkeeper",
  DEFENDER: "Defender",
  MIDFIELDER: "Midfielder",
  FORWARD: "Forward",
  ANY: "Happy anywhere",
};

/**
 * How far along a free-agent request is.
 *
 * Placing a player happens off-site — an administrator puts them in touch with
 * a captain who has room — so these record what the league has done about a
 * request rather than driving anything in the app.
 */
export const FREE_AGENT_STATUSES = ["PENDING", "CONTACTED", "PLACED", "DECLINED"] as const;
export type FreeAgentStatus = (typeof FREE_AGENT_STATUSES)[number];
export const freeAgentStatusSchema = z.enum(FREE_AGENT_STATUSES);

export const FREE_AGENT_STATUS_LABELS: Record<FreeAgentStatus, string> = {
  PENDING: "Awaiting review",
  CONTACTED: "Contacted",
  PLACED: "Placed with a team",
  DECLINED: "Not placed",
};

/** Statuses a player can still edit their own request under. */
export const OPEN_FREE_AGENT_STATUSES: readonly FreeAgentStatus[] = ["PENDING", "CONTACTED"];

export const RESCHEDULE_STATUSES = [
  "PENDING_OPPONENT",
  "PENDING_ADMIN",
  "APPROVED",
  "REJECTED_OPPONENT",
  "REJECTED_ADMIN",
  "CANCELLED",
] as const;
export type RescheduleStatus = (typeof RESCHEDULE_STATUSES)[number];
export const rescheduleStatusSchema = z.enum(RESCHEDULE_STATUSES);

export const RESCHEDULE_STATUS_LABELS: Record<RescheduleStatus, string> = {
  PENDING_OPPONENT: "Awaiting opponent",
  PENDING_ADMIN: "Awaiting league approval",
  APPROVED: "Approved",
  REJECTED_OPPONENT: "Rejected by opponent",
  REJECTED_ADMIN: "Rejected by league",
  CANCELLED: "Cancelled",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  SCHEDULED: "Needs a referee",
  ASSIGNED: "Referee assigned",
  REPORT_SUBMITTED: "Report submitted",
  CONFIRMED: "Confirmed",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
  FORFEIT: "Forfeit",
};

/**
 * The only statuses an admin picks by hand.
 *
 * The others say where a fixture has reached in the referee workflow, and each
 * one is already written on the match: SCHEDULED/ASSIGNED is the referee field,
 * REPORT_SUBMITTED is whether a report exists, FORFEIT is what that report
 * says. `matchDisplayStatus` reads the badge off those facts rather than off
 * this column, which is why only the two decisions nothing else can imply — a
 * result signed off, a fixture called off — are worth offering.
 */
export const ADMIN_SETTABLE_MATCH_STATUSES = ["CONFIRMED", "CANCELLED"] as const;
export type AdminSettableMatchStatus = (typeof ADMIN_SETTABLE_MATCH_STATUSES)[number];

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
