"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { actorFrom } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import { AuthzError, requireAdmin } from "@/lib/authz";
import { pickKitsForFixture, pickKitsForNewTeam } from "@/lib/kits";
import { addDisciplinaryAction, deleteDisciplinaryAction } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { parseLeagueDateTime } from "@/lib/timezone";
import {
  announcementSchema,
  csvMatchRowSchema,
  deleteSeasonSchema,
  deleteTeamSchema,
  deleteDivisionSchema,
  deletePointsAdjustmentSchema,
  disciplinaryActionSchema,
  divisionSchema,
  documentSchema,
  flattenZodError,
  matchCreateSchema,
  pointsAdjustmentSchema,
  seasonSchema,
  teamSchema,
  updateDivisionSchema,
  updateSeasonSchema,
  updateTeamSchema,
} from "@/lib/validation";
import { z } from "zod";

export interface ActionState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

type Handler<T> = (input: T, actor: Awaited<ReturnType<typeof requireAdmin>>) => Promise<string>;

/** Wrap a server action: admin check, Zod parse, audit-friendly error mapping. */
async function run<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
  handler: Handler<z.infer<S>>,
): Promise<ActionState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (error) {
    if (error instanceof AuthzError) return { error: error.message };
    throw error;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: flattenZodError(parsed.error),
    };
  }

  try {
    const ok = await handler(parsed.data, actor);
    return { ok };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return { error: message };
  }
}

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | undefined {
  const value = str(form, key);
  return value.length > 0 ? value : undefined;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === "on" || form.get(key) === "true";
}

function num(form: FormData, key: string): number | undefined {
  const value = str(form, key);
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function refreshAdmin(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export async function createSeasonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form, "name");
  return run(
    seasonSchema,
    {
      name,
      slug: str(form, "slug") || slugify(name),
      startsOn: str(form, "startsOn"),
      endsOn: str(form, "endsOn"),
      isActive: bool(form, "isActive"),
    },
    async (data, actor) => {
      await prisma.$transaction(async (tx) => {
        if (data.isActive) await tx.season.updateMany({ data: { isActive: false } });
        const season = await tx.season.create({
          data: {
            name: data.name,
            slug: data.slug,
            startsOn: new Date(data.startsOn),
            endsOn: new Date(data.endsOn),
            isActive: data.isActive,
          },
        });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "season.create",
          entity: "Season",
          entityId: season.id,
          metadata: data,
        });
      });
      refreshAdmin();
      return `Season “${data.name}” created.`;
    },
  );
}

/**
 * Rename a season or move its dates.
 *
 * Which season is active and how it ranks its table stay on their own buttons:
 * both have side effects well beyond the row being edited.
 */
export async function updateSeasonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    updateSeasonSchema,
    {
      seasonId: str(form, "seasonId"),
      name: str(form, "name"),
      slug: str(form, "slug"),
      startsOn: str(form, "startsOn"),
      endsOn: str(form, "endsOn"),
    },
    async ({ seasonId, ...data }, actor) => {
      const before = await prisma.season.findUnique({ where: { id: seasonId } });
      if (!before) throw new Error("That season no longer exists.");

      const startsOn = new Date(data.startsOn);
      const endsOn = new Date(data.endsOn);
      if (endsOn <= startsOn) throw new Error("The season has to end after it starts.");

      const clash = await prisma.season.findFirst({
        where: { name: data.name, id: { not: seasonId } },
        select: { name: true },
      });
      if (clash) throw new Error(`There is already a season called “${clash.name}”.`);

      const season = await prisma.season.update({
        where: { id: seasonId },
        data: { name: data.name, slug: data.slug, startsOn, endsOn },
      });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "season.update",
        entity: "Season",
        entityId: season.id,
        metadata: { name: data.name, startsOn: data.startsOn, endsOn: data.endsOn },
      });
      refreshAdmin();
      return `Season “${data.name}” updated.`;
    },
  );
}

export async function activateSeasonAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    z.object({ seasonId: z.string().min(1) }),
    { seasonId: str(form, "seasonId") },
    async (data, actor) => {
      await prisma.$transaction(async (tx) => {
        await tx.season.updateMany({ data: { isActive: false } });
        await tx.season.update({ where: { id: data.seasonId }, data: { isActive: true } });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "season.activate",
          entity: "Season",
          entityId: data.seasonId,
        });
      });
      refreshAdmin();
      return "Active season updated.";
    },
  );
}

/**
 * Choose how a season's tables are ranked. Total points is the normal rule;
 * points per game is the fair one while teams have played unequal numbers of
 * fixtures. Stored on the season so every table for it agrees.
 */
export async function setSeasonTiebreakerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    z.object({
      seasonId: z.string().min(1),
      tiebreakerMode: z.enum(["POINTS", "POINTS_PER_GAME"]),
    }),
    { seasonId: str(form, "seasonId"), tiebreakerMode: str(form, "tiebreakerMode") },
    async (data, actor) => {
      await prisma.$transaction(async (tx) => {
        await tx.season.update({
          where: { id: data.seasonId },
          data: { tiebreakerMode: data.tiebreakerMode },
        });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "season.tiebreaker",
          entity: "Season",
          entityId: data.seasonId,
          metadata: { tiebreakerMode: data.tiebreakerMode },
        });
      });
      refreshAdmin();
      return data.tiebreakerMode === "POINTS_PER_GAME"
        ? "Tables for this season now rank on points per game."
        : "Tables for this season now rank on total points.";
    },
  );
}

/**
 * Delete a season and its fixtures — matches, game reports, disciplinary
 * records and points adjustments all cascade.
 *
 * Divisions and teams are deliberately *not* touched: clubs belong to the
 * league and outlive any single competition year. Deleting a season retires
 * the calendar, not the league.
 *
 * The active season is protected: make another season active first. The admin
 * also has to retype the season name, because there is no undo.
 */
export async function deleteSeasonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    deleteSeasonSchema,
    { seasonId: str(form, "seasonId"), confirmName: str(form, "confirmName") },
    async (data, actor) => {
      const season = await prisma.season.findUnique({
        where: { id: data.seasonId },
        include: { _count: { select: { matches: true } } },
      });
      if (!season) throw new Error("That season no longer exists.");

      if (season.isActive) {
        throw new Error(
          "The active season cannot be deleted. Make another season active first, then delete this one.",
        );
      }
      if (data.confirmName.toLowerCase() !== season.name.toLowerCase()) {
        throw new Error(`Type “${season.name}” exactly to confirm the deletion.`);
      }

      const reports = await prisma.gameReport.count({ where: { match: { seasonId: season.id } } });

      await prisma.$transaction(async (tx) => {
        await tx.season.delete({ where: { id: season.id } });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "season.delete",
          entity: "Season",
          entityId: season.id,
          metadata: {
            name: season.name,
            matchesRemoved: season._count.matches,
            reportsRemoved: reports,
          },
        });
      });

      refreshAdmin();
      return `Season “${season.name}” deleted (${season._count.matches} fixture(s), ${reports} report(s)). Divisions and teams were kept.`;
    },
  );
}

// ---------------------------------------------------------------------------
// Divisions / teams / players / venues
// ---------------------------------------------------------------------------

export async function createDivisionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const name = str(form, "name");
  // Position is no longer asked for on the form: a new division simply lands at
  // the bottom of the list, and the admin can reorder later if that ever ships.
  const sortOrder = num(form, "sortOrder") ?? (await prisma.division.count());
  return run(
    divisionSchema,
    {
      name,
      slug: str(form, "slug") || slugify(name),
      sortOrder,
    },
    async (data, actor) => {
      const division = await prisma.division.create({ data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "division.create",
        entity: "Division",
        entityId: division.id,
        metadata: data,
      });
      refreshAdmin();
      return `Division “${data.name}” created.`;
    },
  );
}

/**
 * Rename a division or move it up and down the list.
 *
 * The slug is deliberately left alone: it is only ever derived once, at
 * creation, and anything already pointing at the division keeps working after
 * a rename.
 */
export async function updateDivisionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    updateDivisionSchema,
    {
      divisionId: str(form, "divisionId"),
      name: str(form, "name"),
      slug: str(form, "slug"),
      sortOrder: num(form, "sortOrder") ?? 0,
    },
    async ({ divisionId, ...data }, actor) => {
      const before = await prisma.division.findUnique({ where: { id: divisionId } });
      if (!before) throw new Error("That division no longer exists.");

      const clash = await prisma.division.findFirst({
        where: { name: data.name, id: { not: divisionId } },
        select: { name: true },
      });
      if (clash) throw new Error(`There is already a division called “${clash.name}”.`);

      const division = await prisma.division.update({ where: { id: divisionId }, data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "division.update",
        entity: "Division",
        entityId: division.id,
        metadata: {
          changed: Object.fromEntries(
            Object.entries(data).filter(
              ([key, value]) => (before as Record<string, unknown>)[key] !== value,
            ),
          ),
        },
      });
      refreshAdmin();
      return `Division “${data.name}” updated.`;
    },
  );
}

/**
 * Delete a division, the clubs inside it and their fixtures.
 *
 * A division is the container for its clubs, so removing one cannot leave them
 * orphaned — `onDelete: Cascade` on both `Team.division` and `Match.division`
 * does the work in a single statement.
 *
 * Refused outright when any of those fixtures already has a filed game report,
 * matching `deleteTeamAction`: a played result must never vanish from the
 * standings without a trace. The admin retypes the division name, which is the
 * only confirmation step that survives a mis-click.
 */
export async function deleteDivisionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    deleteDivisionSchema,
    { divisionId: str(form, "divisionId"), confirmName: str(form, "confirmName") },
    async (data, actor) => {
      const division = await prisma.division.findUnique({
        where: { id: data.divisionId },
        include: { _count: { select: { teams: true, matches: true } } },
      });
      if (!division) throw new Error("That division no longer exists.");

      if (data.confirmName.toLowerCase() !== division.name.toLowerCase()) {
        throw new Error(`Type “${division.name}” exactly to confirm the deletion.`);
      }

      const reported = await prisma.gameReport.count({
        where: { match: { divisionId: division.id } },
      });
      if (reported > 0) {
        throw new Error(
          `${division.name} has ${reported} fixture(s) with a filed game report. Results are never deleted — retire the division instead.`,
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.division.delete({ where: { id: division.id } });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "division.delete",
          entity: "Division",
          entityId: division.id,
          metadata: {
            name: division.name,
            teamsRemoved: division._count.teams,
            fixturesRemoved: division._count.matches,
          },
        });
      });

      refreshAdmin();
      return `Division “${division.name}” deleted along with ${division._count.teams} club(s) and ${division._count.matches} fixture(s).`;
    },
  );
}

export async function createTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form, "name");
  return run(
    teamSchema,
    {
      divisionId: str(form, "divisionId"),
      name,
      slug: str(form, "slug") || slugify(name),
      shortName: str(form, "shortName") || name.slice(0, 12),
      colorPrimary: str(form, "colorPrimary") || "#0f766e",
      colorAlternate: str(form, "colorAlternate") || "#ffffff",
      captainName: optional(form, "captainName"),
      contactEmail: str(form, "contactEmail"),
    },
    async (data, actor) => {
      // Slugs are the public team URL (/teams/arsenal), so they must be unique
      // across the whole league, not just inside a division.
      const clash = await prisma.team.findFirst({
        where: { slug: data.slug },
        select: { name: true },
      });
      if (clash) {
        throw new Error(`“${clash.name}” already uses the web address “/teams/${data.slug}”.`);
      }

      const team = await prisma.team.create({ data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "team.create",
        entity: "Team",
        entityId: team.id,
        metadata: data,
      });
      refreshAdmin();
      return `Team “${data.name}” created.`;
    },
  );
}

/**
 * Edit a team after creation.
 *
 * Everything on the team is editable, including the division — a side promoted
 * or relegated between seasons keeps its identity and history rather than
 * being recreated. Fixtures store a kit *choice*, not a hex, so recolouring a
 * team here updates every fixture it appears in automatically.
 */
export async function updateTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form, "name");
  return run(
    updateTeamSchema,
    {
      teamId: str(form, "teamId"),
      divisionId: str(form, "divisionId"),
      name,
      slug: str(form, "slug") || slugify(name),
      shortName: str(form, "shortName") || name.slice(0, 12),
      colorPrimary: str(form, "colorPrimary") || "#0f766e",
      colorAlternate: str(form, "colorAlternate") || "#ffffff",
      captainName: optional(form, "captainName"),
      contactEmail: str(form, "contactEmail"),
    },
    async ({ teamId, ...data }, actor) => {
      const before = await prisma.team.findUnique({ where: { id: teamId } });
      if (!before) throw new Error("That team no longer exists.");

      // The slug is the team's public web address, so it has to be unique
      // league-wide. Excluding this team means re-saving without touching the
      // name is never treated as a clash with itself.
      const clash = await prisma.team.findFirst({
        where: { slug: data.slug, id: { not: teamId } },
        select: { name: true },
      });
      if (clash) {
        throw new Error(`“${clash.name}” already uses the web address “/teams/${data.slug}”.`);
      }

      const team = await prisma.team.update({ where: { id: teamId }, data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "team.update",
        entity: "Team",
        entityId: team.id,
        // Record what actually moved, so the audit trail reads as a diff.
        metadata: {
          changed: Object.fromEntries(
            Object.entries(data).filter(
              ([key, value]) => (before as Record<string, unknown>)[key] !== value,
            ),
          ),
        },
      });
      refreshAdmin();
      return `Team “${data.name}” updated.`;
    },
  );
}

/**
 * Delete a team, plus any fixtures it appears in.
 *
 * Refused outright when any of those fixtures already has a game report — a
 * played result must never disappear from the standings without a trace. The
 * admin has to retype the team name, which is the only confirmation step that
 * survives a mis-click.
 */
export async function deleteTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    deleteTeamSchema,
    { teamId: str(form, "teamId"), confirmName: str(form, "confirmName") },
    async (data, actor) => {
      const team = await prisma.team.findUnique({
        where: { id: data.teamId },
        include: {
          _count: { select: { homeMatches: true, awayMatches: true, discipline: true } },
        },
      });
      if (!team) throw new Error("That team no longer exists.");

      if (data.confirmName.toLowerCase() !== team.name.toLowerCase()) {
        throw new Error(`Type “${team.name}” exactly to confirm the deletion.`);
      }

      const reported = await prisma.match.count({
        where: {
          OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
          report: { isNot: null },
        },
      });
      if (reported > 0) {
        throw new Error(
          `${team.name} has ${reported} fixture(s) with a filed game report. Results are never deleted — retire the team instead.`,
        );
      }

      const fixtures = team._count.homeMatches + team._count.awayMatches;

      await prisma.$transaction(async (tx) => {
        // Match rows cascade from neither side of the relation, so clear them first.
        await tx.match.deleteMany({
          where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
        });
        await tx.team.delete({ where: { id: team.id } });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "team.delete",
          entity: "Team",
          entityId: team.id,
          metadata: {
            name: team.name,
            divisionId: team.divisionId,
            fixturesRemoved: fixtures,
            disciplineRemoved: team._count.discipline,
          },
        });
      });

      refreshAdmin();
      return `Team “${team.name}” deleted along with ${fixtures} fixture(s).`;
    },
  );
}

// ---------------------------------------------------------------------------
// Points adjustments
// ---------------------------------------------------------------------------

export async function createPointsAdjustmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    pointsAdjustmentSchema,
    {
      seasonId: str(form, "seasonId"),
      teamId: str(form, "teamId"),
      points: str(form, "points"),
      reason: str(form, "reason"),
    },
    async (data, actor) => {
      const [season, team] = await Promise.all([
        prisma.season.findUnique({
          where: { id: data.seasonId },
          select: { id: true, name: true },
        }),
        prisma.team.findUnique({
          where: { id: data.teamId },
          select: { id: true, name: true, divisionId: true },
        }),
      ]);
      if (!season) throw new Error("That season no longer exists.");
      if (!team) throw new Error("That team no longer exists.");

      const adjustment = await prisma.$transaction(async (tx) => {
        const created = await tx.pointsAdjustment.create({
          data: {
            seasonId: season.id,
            teamId: team.id,
            points: data.points,
            reason: data.reason,
            createdByEmail: actor.email ?? null,
            createdByName: actor.name ?? null,
          },
        });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "standings.adjust",
          entity: "PointsAdjustment",
          entityId: created.id,
          metadata: {
            seasonId: season.id,
            seasonName: season.name,
            teamId: team.id,
            teamName: team.name,
            points: data.points,
            reason: data.reason,
          },
        });
        return created;
      });

      refreshAdmin();
      revalidatePath("/standings");
      const verb = adjustment.points < 0 ? "deducted from" : "awarded to";
      return `${Math.abs(adjustment.points)} point(s) ${verb} ${team.name} in ${season.name}.`;
    },
  );
}

export async function deletePointsAdjustmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    deletePointsAdjustmentSchema,
    { adjustmentId: str(form, "adjustmentId") },
    async (data, actor) => {
      const existing = await prisma.pointsAdjustment.findUnique({
        where: { id: data.adjustmentId },
        include: { team: { select: { id: true, name: true } } },
      });
      if (!existing) throw new Error("That adjustment has already been removed.");

      await prisma.$transaction(async (tx) => {
        await tx.pointsAdjustment.delete({ where: { id: existing.id } });
        await writeAudit(tx, {
          actor: actorFrom(actor),
          action: "standings.adjust.remove",
          entity: "PointsAdjustment",
          entityId: existing.id,
          metadata: {
            teamId: existing.teamId,
            teamName: existing.team.name,
            points: existing.points,
            reason: existing.reason,
          },
        });
      });

      refreshAdmin();
      revalidatePath("/standings");
      return `Adjustment reversed — ${existing.team.name} is back to its earned points.`;
    },
  );
}

// ---------------------------------------------------------------------------
// Discipline
// ---------------------------------------------------------------------------

/** Record a league-issued sanction that did not come from a game report. */
export async function createDisciplinaryAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    disciplinaryActionSchema,
    {
      seasonId: str(form, "seasonId"),
      teamId: str(form, "teamId"),
      matchId: optional(form, "matchId") ?? null,
      playerName: str(form, "playerName"),
      type: str(form, "type"),
      minute: num(form, "minute") ?? null,
      note: optional(form, "note") ?? null,
    },
    async (data, actor) => {
      await addDisciplinaryAction(prisma, { actor: actorFrom(actor), input: data });
      refreshAdmin();
      return `${data.type === "RED" ? "Red" : "Yellow"} card recorded for ${data.playerName}.`;
    },
  );
}

export async function deleteDisciplinaryActionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(z.object({ id: z.string().min(1) }), { id: str(form, "id") }, async (data, actor) => {
    await deleteDisciplinaryAction(prisma, { id: data.id, actor: actorFrom(actor) });
    refreshAdmin();
    return "Disciplinary record rescinded.";
  });
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export async function createMatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    matchCreateSchema,
    {
      seasonId: str(form, "seasonId"),
      divisionId: str(form, "divisionId"),
      homeTeamId: str(form, "homeTeamId"),
      awayTeamId: str(form, "awayTeamId"),
      venueName: optional(form, "venueName") ?? null,
      kickoffAt: str(form, "kickoffAt"),
      matchweek: str(form, "matchweek") || "1",
      // Unchecked checkboxes are simply absent from the payload.
      countsForStandings: form.get("countsForStandings") === "on",
      homeKit: str(form, "homeKit") || "PRIMARY",
      awayKit: str(form, "awayKit") || "ALTERNATE",
      notes: optional(form, "notes"),
    },
    async (data, actor) => {
      if (data.homeTeamId === data.awayTeamId) {
        throw new Error("A team cannot play itself.");
      }
      const kickoff = parseLeagueDateTime(data.kickoffAt);
      if (!kickoff) throw new Error("Kick-off date is not valid.");

      const match = await prisma.match.create({
        data: {
          seasonId: data.seasonId,
          divisionId: data.divisionId,
          homeTeamId: data.homeTeamId,
          awayTeamId: data.awayTeamId,
          venueName: data.venueName ?? null,
          kickoffAt: kickoff,
          matchweek: data.matchweek,
          countsForStandings: data.countsForStandings,
          homeKit: data.homeKit,
          awayKit: data.awayKit,
          notes: data.notes ?? null,
          status: "SCHEDULED",
        },
      });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "match.create",
        entity: "Match",
        entityId: match.id,
        metadata: data,
      });
      refreshAdmin();
      return "Fixture created.";
    },
  );
}

export async function deleteMatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(
    z.object({ matchId: z.string().min(1) }),
    { matchId: str(form, "matchId") },
    async (data, actor) => {
      const match = await prisma.match.findUniqueOrThrow({
        where: { id: data.matchId },
        include: { report: { select: { id: true } } },
      });
      if (match.report) {
        throw new Error("Delete the game report first — results must never vanish silently.");
      }
      await prisma.match.delete({ where: { id: data.matchId } });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "match.delete",
        entity: "Match",
        entityId: data.matchId,
        metadata: { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
      });
      refreshAdmin();
      return "Fixture deleted.";
    },
  );
}

// ---------------------------------------------------------------------------
// Announcements & documents
// ---------------------------------------------------------------------------

export async function createAnnouncementAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const title = str(form, "title");
  return run(
    announcementSchema,
    {
      title,
      slug: str(form, "slug") || slugify(title),
      summary: str(form, "summary"),
      body: str(form, "body"),
      pinned: bool(form, "pinned"),
      seasonId: optional(form, "seasonId") ?? null,
    },
    async (data, actor) => {
      const announcement = await prisma.announcement.create({
        data: { ...data, seasonId: data.seasonId ?? null, publishedAt: new Date() },
      });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "announcement.create",
        entity: "Announcement",
        entityId: announcement.id,
        metadata: { title: data.title },
      });
      refreshAdmin();
      return "Announcement published.";
    },
  );
}

export async function createDocumentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  return run(
    documentSchema,
    {
      title: str(form, "title"),
      description: optional(form, "description"),
      category: str(form, "category") || "OTHER",
      url: str(form, "url"),
      fileType: optional(form, "fileType"),
      sortOrder: num(form, "sortOrder") ?? 0,
    },
    async (data, actor) => {
      const doc = await prisma.document.create({ data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "document.create",
        entity: "Document",
        entityId: doc.id,
        metadata: { title: data.title },
      });
      refreshAdmin();
      return "Document added.";
    },
  );
}

// ---------------------------------------------------------------------------
// CSV schedule import
// ---------------------------------------------------------------------------

/**
 * Read the optional `counts` column. A blank cell means "counts", so a template
 * exported before the column existed still imports every fixture into the
 * table. Only an explicit negative opts a fixture out.
 */
function csvCountsForStandings(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return !["no", "n", "false", "0", "off", "exhibition", "friendly"].includes(value);
}

export interface CsvPreviewRow {
  line: number;
  raw: Record<string, string>;
  error?: string;
  /** Non-blocking observations — e.g. a club that will be created on import. */
  notes?: string[];
  resolved?: {
    divisionId: string;
    divisionName: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    /** Whatever the CSV said, stored verbatim. Never looked up, never created. */
    venueName: string | null;
    kickoffAt: string;
    matchweek: string;
    /** False for a final / play-off / friendly that must not move the table. */
    countsForStandings: boolean;
    duplicate: boolean;
  };
}

export interface CsvImportState extends ActionState {
  rows?: CsvPreviewRow[];
  validCount?: number;
  errorCount?: number;
  duplicateCount?: number;
  /** Divisions the import will create, by name, in the order first seen. */
  newDivisions?: string[];
  /** Teams the import will create, as "Club (Division)". */
  newTeams?: string[];
  committed?: boolean;
  csv?: string;
  seasonId?: string;
}

export async function importScheduleAction(
  _prev: CsvImportState,
  form: FormData,
): Promise<CsvImportState> {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (error) {
    if (error instanceof AuthzError) return { error: error.message };
    throw error;
  }

  const csv = str(form, "csv");
  const seasonId = str(form, "seasonId");
  const commit = str(form, "mode") === "commit";

  if (!csv) return { error: "Paste some CSV first." };
  if (!seasonId) return { error: "Pick a season." };

  const grid = parseCsv(csv);
  if (grid.length < 2) {
    return { error: "Need a header row plus at least one fixture row.", csv, seasonId };
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const required = ["matchweek", "kickoff", "division", "home", "away"];
  const missing = required.filter((key) => !header.includes(key));
  if (missing.length > 0) {
    return {
      error: `CSV header is missing: ${missing.join(", ")}. Expected columns: matchweek, kickoff, division, home, away.`,
      csv,
      seasonId,
    };
  }

  const [divisions, teams, existing] = await Promise.all([
    // Divisions and teams belong to the league, not to a season, so the
    // importer matches against the whole register rather than one year of it.
    prisma.division.findMany({ select: { id: true, name: true, slug: true, sortOrder: true } }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        shortName: true,
        divisionId: true,
        colorPrimary: true,
        colorAlternate: true,
      },
    }),
    prisma.match.findMany({
      where: { seasonId },
      select: { homeTeamId: true, awayTeamId: true, matchweek: true },
    }),
  ]);

  const key = (value: string) => value.trim().toLowerCase();
  const divisionIndex = new Map<string, (typeof divisions)[number]>();
  for (const d of divisions) {
    divisionIndex.set(key(d.name), d);
    divisionIndex.set(key(d.slug), d);
  }
  const teamIndex = new Map<string, (typeof teams)[number]>();
  for (const t of teams) {
    teamIndex.set(key(t.name), t);
    teamIndex.set(key(t.slug), t);
    teamIndex.set(key(t.shortName), t);
  }
  const existingKeys = new Set(
    existing.map((m) => `${m.matchweek}|${m.homeTeamId}|${m.awayTeamId}`),
  );

  // ---- auto-creation -------------------------------------------------------
  // A schedule is usually the first thing an organiser has; demanding that
  // every division and club be keyed in by hand first turns a 100-row paste
  // into 100 errors. Anything unrecognised is planned here, listed in the dry
  // run, and only written when the admin commits.
  //
  // Venues are deliberately absent from this: they are free text on the
  // fixture, copied across exactly as typed.
  const pendingDivisions = new Map<
    string,
    { ref: string; name: string; slug: string; sortOrder: number }
  >();
  const pendingTeams = new Map<
    string,
    {
      ref: string;
      name: string;
      slug: string;
      shortName: string;
      divisionRef: string;
      colorPrimary: string;
      colorAlternate: string;
    }
  >();

  const takenDivisionSlugs = new Set(divisions.map((d) => d.slug));
  // Team slugs are the public /teams/<slug> address, so they are reserved
  // league-wide. One set for the whole import: each planned club adds to it, so
  // two same-named newcomers in different leagues still get distinct addresses.
  const takenTeamSlugs = new Set(teams.map((t) => t.slug));
  const uniqueSlug = (base: string, taken: Set<string>) => {
    const root = slugify(base) || "item";
    let candidate = root;
    let n = 2;
    while (taken.has(candidate)) candidate = `${root}-${n++}`;
    taken.add(candidate);
    return candidate;
  };

  /** A division by name, planning a new one when the league has never heard of it. */
  function resolveDivision(name: string) {
    const found = divisionIndex.get(key(name));
    if (found) return { ref: found.id, name: found.name, isNew: false };

    const planned = pendingDivisions.get(key(name));
    if (planned) return { ref: planned.ref, name: planned.name, isNew: true };

    const created = {
      ref: `new:division:${pendingDivisions.size}`,
      name: name.trim(),
      slug: uniqueSlug(name, takenDivisionSlugs),
      sortOrder: divisions.length + pendingDivisions.size,
    };
    pendingDivisions.set(key(name), created);
    return { ref: created.ref, name: created.name, isNew: true };
  }

  /** A short name for a new club: an acronym if it has several words, else a prefix. */
  const shortNameFor = (name: string) => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const acronym = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? name);
    return acronym.slice(0, 4).toUpperCase();
  };

  /** A team by name, planning a new one inside `divisionRef` when unknown. */
  function resolveTeam(name: string, divisionRef: string) {
    const found = teamIndex.get(key(name));
    if (found) {
      return {
        ref: found.id,
        name: found.name,
        divisionRef: found.divisionId,
        colorPrimary: found.colorPrimary,
        colorAlternate: found.colorAlternate,
        isNew: false,
      };
    }

    const planned = pendingTeams.get(key(name));
    if (planned) {
      return {
        ref: planned.ref,
        name: planned.name,
        divisionRef: planned.divisionRef,
        colorPrimary: planned.colorPrimary,
        colorAlternate: planned.colorAlternate,
        isNew: true,
      };
    }

    // Keep new clubs visually distinct from everyone they will line up against.
    const takenColors = [
      ...teams.filter((t) => t.divisionId === divisionRef).map((t) => t.colorPrimary),
      ...[...pendingTeams.values()]
        .filter((t) => t.divisionRef === divisionRef)
        .map((t) => t.colorPrimary),
    ];
    const kit = pickKitsForNewTeam(takenColors);

    const created = {
      ref: `new:team:${pendingTeams.size}`,
      name: name.trim(),
      slug: uniqueSlug(name, takenTeamSlugs),
      shortName: shortNameFor(name),
      divisionRef,
      colorPrimary: kit.primary,
      colorAlternate: kit.alternate,
    };
    pendingTeams.set(key(name), created);
    return {
      ref: created.ref,
      name: created.name,
      divisionRef,
      colorPrimary: kit.primary,
      colorAlternate: kit.alternate,
      isNew: true,
    };
  }

  const colorsByRef = new Map<string, { colorPrimary: string; colorAlternate: string }>(
    teams.map((t) => [t.id, { colorPrimary: t.colorPrimary, colorAlternate: t.colorAlternate }]),
  );

  const rows: CsvPreviewRow[] = [];

  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i];
    const raw: Record<string, string> = {};
    header.forEach((name, idx) => {
      raw[name] = (cells[idx] ?? "").trim();
    });

    const parsed = csvMatchRowSchema.safeParse(raw);
    if (!parsed.success) {
      rows.push({ line: i + 1, raw, error: Object.values(flattenZodError(parsed.error))[0] });
      continue;
    }

    const kickoff = parseLeagueDateTime(parsed.data.kickoff);
    const problems: string[] = [];
    const notes: string[] = [];

    if (!kickoff) {
      problems.push(
        `unreadable kick-off “${parsed.data.kickoff}” — try 2026-08-05 17:30 or 8/5/2026 5:30 pm`,
      );
    }

    const division = resolveDivision(parsed.data.division);
    const home = resolveTeam(parsed.data.home, division.ref);
    const away = resolveTeam(parsed.data.away, division.ref);

    if (home.ref === away.ref) problems.push("a team cannot play itself");
    if (division.isNew) notes.push(`creates division “${division.name}”`);
    if (home.isNew) notes.push(`creates team “${home.name}”`);
    if (away.isNew) notes.push(`creates team “${away.name}”`);

    // A club recorded in another division is a promotion or a typo, and the
    // importer cannot tell which. The fixture carries its own division, so this
    // is reported and imported rather than blocked.
    for (const side of [home, away]) {
      if (!side.isNew && side.divisionRef !== division.ref) {
        notes.push(`${side.name} is normally listed in another division`);
      }
    }

    if (problems.length > 0 || !kickoff) {
      rows.push({ line: i + 1, raw, error: problems.join("; "), notes });
      continue;
    }

    rows.push({
      line: i + 1,
      raw,
      notes: notes.length > 0 ? notes : undefined,
      resolved: {
        divisionId: division.ref,
        divisionName: division.name,
        homeTeamId: home.ref,
        homeTeamName: home.name,
        awayTeamId: away.ref,
        awayTeamName: away.name,
        venueName: parsed.data.venue?.trim() || null,
        kickoffAt: kickoff.toISOString(),
        matchweek: parsed.data.matchweek,
        countsForStandings: csvCountsForStandings(parsed.data.counts),
        duplicate: existingKeys.has(`${parsed.data.matchweek}|${home.ref}|${away.ref}`),
      },
    });
  }

  const importable = rows.filter((r) => r.resolved && !r.resolved.duplicate);
  const errorCount = rows.filter((r) => r.error).length;
  const duplicateCount = rows.filter((r) => r.resolved?.duplicate).length;

  // Only advertise the entities the surviving rows actually need.
  const neededRefs = new Set(
    importable.flatMap((r) => [
      r.resolved!.divisionId,
      r.resolved!.homeTeamId,
      r.resolved!.awayTeamId,
    ]),
  );
  const creatingDivisions = [...pendingDivisions.values()].filter((d) => neededRefs.has(d.ref));
  const creatingTeams = [...pendingTeams.values()].filter((t) => neededRefs.has(t.ref));
  const divisionNameByRef = new Map<string, string>([
    ...divisions.map((d) => [d.id, d.name] as [string, string]),
    ...[...pendingDivisions.values()].map((d) => [d.ref, d.name] as [string, string]),
  ]);

  const summary: CsvImportState = {
    rows,
    validCount: importable.length,
    errorCount,
    duplicateCount,
    newDivisions: creatingDivisions.length > 0 ? creatingDivisions.map((d) => d.name) : undefined,
    newTeams:
      creatingTeams.length > 0
        ? creatingTeams.map(
            (t) => `${t.name} (${divisionNameByRef.get(t.divisionRef) ?? "new division"})`,
          )
        : undefined,
    csv,
    seasonId,
  };

  if (!commit) {
    const additions = [
      creatingDivisions.length > 0 ? `${creatingDivisions.length} new division(s)` : null,
      creatingTeams.length > 0 ? `${creatingTeams.length} new team(s)` : null,
    ].filter(Boolean);
    return {
      ...summary,
      ok: `Dry run: ${importable.length} fixture(s) ready to import, ${duplicateCount} duplicate(s) skipped, ${errorCount} row(s) with errors${
        additions.length > 0 ? `. Will also create ${additions.join(" and ")}` : ""
      }.`,
    };
  }

  if (errorCount > 0) {
    return { ...summary, error: "Fix every row error before importing." };
  }
  if (importable.length === 0) {
    return { ...summary, error: "Nothing new to import." };
  }

  await prisma.$transaction(async (tx) => {
    // Divisions first, then teams, then fixtures: each step turns the planned
    // refs from the step before into real ids.
    const idByRef = new Map<string, string>();

    for (const division of creatingDivisions) {
      const created = await tx.division.create({
        data: { name: division.name, slug: division.slug, sortOrder: division.sortOrder },
      });
      idByRef.set(division.ref, created.id);
      await writeAudit(tx, {
        actor: actorFrom(actor),
        action: "division.create",
        entity: "Division",
        entityId: created.id,
        metadata: { name: division.name, slug: division.slug, source: "schedule.import" },
      });
    }

    for (const team of creatingTeams) {
      const created = await tx.team.create({
        data: {
          divisionId: idByRef.get(team.divisionRef) ?? team.divisionRef,
          name: team.name,
          slug: team.slug,
          shortName: team.shortName,
          colorPrimary: team.colorPrimary,
          colorAlternate: team.colorAlternate,
        },
      });
      idByRef.set(team.ref, created.id);
      colorsByRef.set(team.ref, {
        colorPrimary: team.colorPrimary,
        colorAlternate: team.colorAlternate,
      });
      await writeAudit(tx, {
        actor: actorFrom(actor),
        action: "team.create",
        entity: "Team",
        entityId: created.id,
        metadata: { name: team.name, slug: team.slug, source: "schedule.import" },
      });
    }

    const realId = (ref: string) => idByRef.get(ref) ?? ref;

    await tx.match.createMany({
      data: importable.map((row) => ({
        seasonId,
        divisionId: realId(row.resolved!.divisionId),
        homeTeamId: realId(row.resolved!.homeTeamId),
        awayTeamId: realId(row.resolved!.awayTeamId),
        venueName: row.resolved!.venueName,
        kickoffAt: new Date(row.resolved!.kickoffAt),
        matchweek: row.resolved!.matchweek,
        countsForStandings: row.resolved!.countsForStandings,
        status: "SCHEDULED",
        ...pickKitsForFixture(
          colorsByRef.get(row.resolved!.homeTeamId),
          colorsByRef.get(row.resolved!.awayTeamId),
        ),
      })),
    });
    await writeAudit(tx, {
      actor: actorFrom(actor),
      action: "schedule.import",
      entity: "Season",
      entityId: seasonId,
      metadata: {
        imported: importable.length,
        skippedDuplicates: duplicateCount,
        divisionsCreated: creatingDivisions.length,
        teamsCreated: creatingTeams.length,
      },
    });
  });

  refreshAdmin();
  const created = [
    creatingDivisions.length > 0 ? `${creatingDivisions.length} division(s)` : null,
    creatingTeams.length > 0 ? `${creatingTeams.length} team(s)` : null,
  ].filter(Boolean);
  return {
    ...summary,
    rows: undefined,
    csv: "",
    ok: `Imported ${importable.length} fixture(s)${created.length > 0 ? `, creating ${created.join(" and ")}` : ""}.`,
    committed: true,
  };
}
