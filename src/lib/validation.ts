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
  kickoffAt: z.string().datetime({ offset: true }).optional(),
  /** Free text, shown on the fixture exactly as typed. Never validated. */
  venueName: z.string().max(200).nullable().optional(),
  status: z.enum(MATCH_STATUSES).optional(),
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

export const divisionSchema = z.object({
  name: trimmed(120).min(2),
  slug: trimmed(120)
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().min(0).max(99).default(0),
});

export const teamSchema = z.object({
  divisionId: z.string().min(1),
  name: trimmed(120).min(2),
  slug: trimmed(120)
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  shortName: trimmed(24).min(1),
  colorPrimary: hexColor("#0f766e"),
  colorAlternate: hexColor("#ffffff"),
  captainName: optionalText(120).optional(),
  contactEmail: z
    .string()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
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
  matchweek: z.number().int().min(1).max(60),
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

/**
 * One row of the admin CSV schedule import.
 *
 * Nothing here is checked against the league register. Divisions and clubs that
 * are not on file are created on import rather than rejected, so a schedule can
 * be loaded before any of them have been keyed in by hand. The venue is not
 * even that — it is simply text copied onto the fixture.
 */
export const csvMatchRowSchema = z.object({
  matchweek: z.coerce.number().int().min(1).max(60),
  kickoff: z.string().min(4),
  division: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
  /**
   * Free text, stored on the fixture exactly as typed. There is no venue
   * register to check it against and nothing is ever created from it.
   */
  venue: z.string().optional().default(""),
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
