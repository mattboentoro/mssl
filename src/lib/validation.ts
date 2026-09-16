import { z } from "zod";

import { CARD_TYPES, DOCUMENT_CATEGORIES, KIT_CHOICES, MATCH_STATUSES } from "@/lib/enums";
import { normalizeHex } from "@/lib/kits";

/** Shared Zod schemas. Every API route and server action validates with these. */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

/** A `#rgb` / `#rrggbb` kit colour, stored normalised to lower-case `#rrggbb`. */
const hexColor = (fallback: string) =>
  z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour such as #1d4ed8.")
    .transform(normalizeHex)
    .default(fallback);

/** Minutes 0-130 covers 90 + stoppage + extra time, and 0 for pre-match cards. */
export const minuteSchema = z
  .number({ invalid_type_error: "Minute must be a number." })
  .int("Minute must be a whole number.")
  .min(0, "Minute cannot be negative.")
  .max(130, "Minute must be 130 or less.");

export const scoreSchema = z
  .number({ invalid_type_error: "Score must be a number." })
  .int("Score must be a whole number.")
  .min(0, "Score cannot be negative.")
  .max(99, "Score looks implausible.");

/**
 * A card inside a game report. The league keeps no squad lists, so the player
 * is identified by free text exactly as the referee wrote it on the card.
 */
export const reportCardSchema = z.object({
  type: z.enum(CARD_TYPES),
  teamId: z.string().min(1, "Pick a team."),
  playerName: trimmed(120).min(2, "Enter the player's name."),
  minute: minuteSchema.nullable().optional(),
  note: optionalText(280).nullable().optional(),
});

export const gameReportSchema = z
  .object({
    homeScore: scoreSchema,
    awayScore: scoreSchema,
    homeForfeit: z.boolean().default(false),
    awayForfeit: z.boolean().default(false),
    notes: optionalText(4000).nullable().optional(),
    incidentReport: optionalText(4000).nullable().optional(),
    misconduct: optionalText(4000).nullable().optional(),
    cards: z.array(reportCardSchema).max(60).default([]),
  })
  .superRefine((value, ctx) => {
    if (
      value.homeForfeit &&
      value.awayForfeit &&
      (value.homeScore !== 0 || value.awayScore !== 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["homeScore"],
        message: "A double forfeit must be recorded as 0-0.",
      });
    }
  });

export type GameReportPayload = z.infer<typeof gameReportSchema>;

/** A league-issued sanction added by an admin outside any single fixture. */
export const disciplinaryActionSchema = z.object({
  seasonId: z.string().min(1, "Pick a season."),
  teamId: z.string().min(1, "Pick a team."),
  matchId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  playerName: trimmed(120).min(2, "Enter the player's name."),
  type: z.enum(CARD_TYPES),
  minute: minuteSchema.nullable().optional(),
  note: optionalText(500).nullable().optional(),
  /**
   * Ban length in fixtures. Left blank a red card lands in the review queue,
   * which is the whole point of the queue — an administrator has to decide.
   */
  gamesSuspended: z.number().int().min(0).max(50).nullable().optional(),
});

export const suspensionLengthSchema = z.object({
  id: z.string().min(1),
  gamesSuspended: z.number().int().min(0, "Enter zero or more games.").max(50),
  note: optionalText(500).nullable().optional(),
});

export const assignSchema = z.object({
  expectedVersion: z.number().int().min(0).optional(),
});

export const unassignSchema = z.object({
  reason: optionalText(500).optional(),
});

export const reasonSchema = z.object({
  reason: trimmed(500).min(5, "Give a reason of at least 5 characters."),
});

export const overrideSchema = reasonSchema.extend({
  homeScore: scoreSchema,
  awayScore: scoreSchema,
  homeForfeit: z.boolean().default(false),
  awayForfeit: z.boolean().default(false),
});

export const matchUpdateSchema = z.object({
  /*
    A bare wall-clock string from the admin form ("2026-10-01T19:30"), read as
    league time by the route. Demanding an ISO offset here rejected every save
    the form could make, so the only rule is that it is short and non-empty —
    the route returns 400 on anything it cannot parse.
  */
  kickoffAt: z.string().min(1).max(40).optional(),
  /** Free text, shown on the fixture exactly as typed. Never validated. */
  venueName: z.string().max(200).nullable().optional(),
  /*
    Any status is accepted here, but Match Control only offers the two an admin
    owns outright plus the fixture's own workflow status — see
    ADMIN_SETTABLE_MATCH_STATUSES and deriveMatchStatus.
  */
  status: z.enum(MATCH_STATUSES).optional(),
  matchweek: trimmed(40).min(1, "Give the fixture a matchweek, such as 7 or Final.").optional(),
  countsForStandings: z.boolean().optional(),
  /*
    Correcting a mis-entered fixture. Only accepted while no report exists —
    goals and cards point at a team, so moving the teams underneath a filed
    report would silently corrupt it.
  */
  divisionId: z.string().min(1).optional(),
  homeTeamId: z.string().min(1).optional(),
  awayTeamId: z.string().min(1).optional(),
  homeKit: z.enum(KIT_CHOICES).optional(),
  awayKit: z.enum(KIT_CHOICES).optional(),
  reason: optionalText(500).optional(),
});

export const adminAssignSchema = z.object({
  refereeId: z.string().nullable(),
  reason: optionalText(500).optional(),
});

export const seasonSchema = z.object({
  name: trimmed(120).min(2),
  slug: trimmed(120)
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Lower-case letters, digits and dashes only."),
  startsOn: z.string().min(4),
  endsOn: z.string().min(4),
  isActive: z.boolean().default(false),
});

export const updateSeasonSchema = seasonSchema.extend({
  seasonId: z.string().min(1),
  tiebreakerMode: z.enum(["POINTS", "POINTS_PER_GAME"]),
});

export const divisionSchema = z.object({
  name: trimmed(120).min(2),
  slug: trimmed(120)
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().min(0).max(99).default(0),
});

export const updateDivisionSchema = divisionSchema.extend({ divisionId: z.string().min(1) });

export const teamCaptainSchema = z.object({
  name: trimmed(120).min(1, "Enter the captain's name."),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
});

export const teamSchema = z.object({
  divisionId: z.string().min(1),
  name: trimmed(120).min(2),
  // Now typed by hand on the create form, so the failure has to say what a
  // legal address looks like rather than Zod's bare "Invalid".
  slug: trimmed(120)
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use lower-case letters, numbers and hyphens only — rcs-united."),
  shortName: trimmed(24).min(1),
  colorPrimary: hexColor("#0f766e"),
  colorAlternate: hexColor("#ffffff"),
  captains: z
    .array(teamCaptainSchema)
    .min(1, "A team must have at least 1 captain.")
    .max(5, "A team can have at most 5 captains."),
});

export const updateTeamSchema = teamSchema.extend({ teamId: z.string().min(1) });

/**
 * Deleting a season or a team is irreversible, so the admin has to retype the
 * name exactly. The comparison itself happens in the action, which knows the
 * real name; this only guarantees something was typed.
 */
export const deleteSeasonSchema = z.object({
  seasonId: z.string().min(1),
  confirmName: trimmed(120).min(1, "Type the season name to confirm."),
});

export const deleteTeamSchema = z.object({
  teamId: z.string().min(1),
  confirmName: trimmed(120).min(1, "Type the team name to confirm."),
});

export const deleteDivisionSchema = z.object({
  divisionId: z.string().min(1),
  confirmName: trimmed(120).min(1, "Type the division name to confirm."),
});

/**
 * An administrative points adjustment. The reason is mandatory and shown on the
 * public table, because an unexplained deduction is indistinguishable from a
 * mistake. Zero is rejected so that every stored row actually changes something.
 *
 * The season is explicit: teams outlive seasons, so a deduction served in one
 * competition year must not follow the club into the next.
 */
export const pointsAdjustmentSchema = z.object({
  seasonId: z.string().min(1, "Choose a season."),
  teamId: z.string().min(1, "Choose a team."),
  points: z.coerce
    .number()
    .int("Use a whole number of points.")
    .min(-50, "That is more than any plausible deduction.")
    .max(50, "That is more than any plausible award.")
    .refine((value) => value !== 0, "Enter a non-zero number of points."),
  reason: trimmed(300).min(5, "Give a reason — it is shown on the public table."),
});

export const deletePointsAdjustmentSchema = z.object({
  adjustmentId: z.string().min(1),
});

export const matchCreateSchema = z.object({
  seasonId: z.string().min(1),
  divisionId: z.string().min(1),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  /** Free text, shown on the fixture exactly as typed. Never validated. */
  venueName: z.string().max(200).nullable().optional(),
  kickoffAt: z.string().min(4),
  /**
   * Free text, so a season can label a fixture "Final" or "Cup R1" as easily
   * as "7". Fixtures are always ordered by kick-off, never by this.
   */
  matchweek: trimmed(40).min(1, "Give the fixture a matchweek, such as 7 or Final."),
  /** Clear for a final, play-off or friendly that must not move the table. */
  countsForStandings: z.boolean().default(true),
  homeKit: z.enum(KIT_CHOICES).default("PRIMARY"),
  awayKit: z.enum(KIT_CHOICES).default("ALTERNATE"),
  notes: optionalText(500).optional(),
});

export const documentSchema = z.object({
  title: trimmed(160).min(2),
  description: optionalText(500).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
  url: trimmed(600).min(3),
  fileType: optionalText(20).optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const updateDocumentSchema = documentSchema.extend({
  documentId: z.string().min(1),
});

export const deleteDocumentSchema = z.object({
  documentId: z.string().min(1),
});

export const announcementSchema = z.object({
  title: trimmed(200).min(3),
  slug: trimmed(200)
    .min(3)
    .regex(/^[a-z0-9-]+$/),
  summary: trimmed(400).min(3),
  body: trimmed(20000).min(3),
  pinned: z.boolean().default(false),
  seasonId: z.string().nullable().optional(),
});

export const updateAnnouncementSchema = announcementSchema.extend({
  announcementId: z.string().min(1),
});

export const deleteAnnouncementSchema = z.object({
  announcementId: z.string().min(1),
});

/**
 * One row of the admin CSV schedule import.
 *
 * Nothing here is checked against the league register. Divisions and clubs that
 * are not on file are created on import rather than rejected, so a schedule can
 * be loaded before any of them have been keyed in by hand. The venue is not
 * even that — it is simply text copied onto the fixture.
 */
export const csvMatchRowSchema = z.object({
  matchweek: z.coerce.string().trim().min(1).max(40),
  kickoff: z.string().min(4),
  division: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
  /**
   * Free text, stored on the fixture exactly as typed. There is no venue
   * register to check it against and nothing is ever created from it.
   */
  venue: z.string().optional().default(""),
  /**
   * Optional. Anything falsy-looking ("no", "false", "0") marks the fixture as
   * not counting towards the table; a blank column leaves it counting, so an
   * older template without the column still imports unchanged.
   */
  counts: z.string().optional().default(""),
});

export type CsvMatchRow = z.infer<typeof csvMatchRowSchema>;

/** Flatten a ZodError into `{ field: message }` for form display. */
export function flattenZodError(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
