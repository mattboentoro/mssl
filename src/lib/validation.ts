import { z } from "zod";

import { DOCUMENT_CATEGORIES, GAME_EVENT_TYPES, MATCH_STATUSES } from "@/lib/enums";

/** Shared Zod schemas. Every API route and server action validates with these. */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

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

export const gameEventSchema = z.object({
  type: z.enum(GAME_EVENT_TYPES),
  teamId: z.string().min(1, "Pick a team."),
  playerId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  minute: minuteSchema,
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
    events: z.array(gameEventSchema).max(200).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.homeForfeit && value.awayForfeit) {
      // Allowed (double forfeit) but the scoreline is then meaningless.
      if (value.homeScore !== 0 || value.awayScore !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["homeScore"],
          message: "A double forfeit must be recorded as 0-0.",
        });
      }
      return;
    }
    if (value.homeForfeit || value.awayForfeit) return; // score comes from league rules

    const tally = value.events.reduce(
      (acc, event) => {
        if (event.type !== "GOAL" && event.type !== "PENALTY_GOAL" && event.type !== "OWN_GOAL") {
          return acc;
        }
        acc.total += 1;
        return acc;
      },
      { total: 0 },
    );

    if (tally.total !== value.homeScore + value.awayScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["events"],
        message: `You recorded ${value.homeScore + value.awayScore} goal(s) in the score but itemised ${tally.total}. Add a goal event for each one (the scorer may be left blank).`,
      });
    }
  });

export type GameReportPayload = z.infer<typeof gameReportSchema>;

export const assignSchema = z.object({
  expectedVersion: z.number().int().min(0).optional(),
});

export const lockSchema = z.object({
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
  venueId: z.string().nullable().optional(),
  status: z.enum(MATCH_STATUSES).optional(),
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
  seasonId: z.string().min(1),
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
  colorPrimary: trimmed(9).default("#0f766e"),
  crestEmoji: trimmed(8).default("\u26BD"),
  captainName: optionalText(120).optional(),
  contactEmail: z
    .string()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
});

export const playerSchema = z.object({
  teamId: z.string().min(1),
  firstName: trimmed(60).min(1),
  lastName: trimmed(60).min(1),
  jerseyNumber: z.number().int().min(0).max(99).nullable().optional(),
  position: optionalText(40).optional(),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  active: z.boolean().default(true),
});

export const venueSchema = z.object({
  name: trimmed(120).min(2),
  slug: trimmed(120)
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  address: optionalText(240).optional(),
  city: optionalText(120).optional(),
  mapUrl: optionalText(500).optional(),
  notes: optionalText(500).optional(),
});

export const matchCreateSchema = z.object({
  seasonId: z.string().min(1),
  divisionId: z.string().min(1),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1),
  venueId: z.string().nullable().optional(),
  kickoffAt: z.string().min(4),
  matchweek: z.number().int().min(1).max(60),
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

/** One row of the admin CSV schedule import. */
export const csvMatchRowSchema = z.object({
  matchweek: z.coerce.number().int().min(1).max(60),
  kickoff: z.string().min(4),
  division: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
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
