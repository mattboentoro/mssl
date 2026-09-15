"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { actorFrom } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import { AuthzError, requireAdmin } from "@/lib/authz";
import { pickKitsForFixture } from "@/lib/kits";
import { addDisciplinaryAction, deleteDisciplinaryAction } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { parseLeagueDateTime } from "@/lib/timezone";
import {
  announcementSchema,
  csvMatchRowSchema,
  deleteSeasonSchema,
  deleteTeamSchema,
  deletePointsAdjustmentSchema,
  disciplinaryActionSchema,
  divisionSchema,
  documentSchema,
  flattenZodError,
  matchCreateSchema,
  pointsAdjustmentSchema,
  seasonSchema,
  teamSchema,
  updateTeamSchema,
  venueSchema,
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
 * Delete a season and everything under it — divisions, teams, fixtures, game
 * reports and disciplinary records all cascade.
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
        include: { _count: { select: { divisions: true, matches: true } } },
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
            divisionsRemoved: season._count.divisions,
            matchesRemoved: season._count.matches,
            reportsRemoved: reports,
          },
        });
      });

      refreshAdmin();
      return `Season “${season.name}” deleted (${season._count.matches} fixture(s), ${reports} report(s)).`;
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
  return run(
    divisionSchema,
    {
      seasonId: str(form, "seasonId"),
      name,
      slug: str(form, "slug") || slugify(name),
      sortOrder: num(form, "sortOrder") ?? 0,
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

      const clash = await prisma.team.findFirst({
        where: { slug: data.slug, id: { not: teamId } },
        select: { name: true },
      });
      if (clash) throw new Error(`“${clash.name}” already uses the slug “${data.slug}”.`);

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
      teamId: str(form, "teamId"),
      points: str(form, "points"),
      reason: str(form, "reason"),
    },
    async (data, actor) => {
      const team = await prisma.team.findUnique({
        where: { id: data.teamId },
        select: { id: true, name: true, divisionId: true },
      });
      if (!team) throw new Error("That team no longer exists.");

      const adjustment = await prisma.$transaction(async (tx) => {
        const created = await tx.pointsAdjustment.create({
          data: {
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
      return `${Math.abs(adjustment.points)} point(s) ${verb} ${team.name}.`;
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

export async function createVenueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = str(form, "name");
  return run(
    venueSchema,
    {
      name,
      slug: str(form, "slug") || slugify(name),
      address: optional(form, "address"),
      city: optional(form, "city"),
      mapUrl: optional(form, "mapUrl"),
      notes: optional(form, "notes"),
    },
    async (data, actor) => {
      const venue = await prisma.venue.create({ data });
      await writeAudit(prisma, {
        actor: actorFrom(actor),
        action: "venue.create",
        entity: "Venue",
        entityId: venue.id,
        metadata: data,
      });
      refreshAdmin();
      return `Venue “${data.name}” created.`;
    },
  );
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
      venueId: optional(form, "venueId") ?? null,
      kickoffAt: str(form, "kickoffAt"),
      matchweek: num(form, "matchweek") ?? 1,
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
          venueId: data.venueId ?? null,
          kickoffAt: kickoff,
          matchweek: data.matchweek,
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

export interface CsvPreviewRow {
  line: number;
  raw: Record<string, string>;
  error?: string;
  resolved?: {
    divisionId: string;
    divisionName: string;
    homeTeamId: string;
    homeTeamName: string;
    awayTeamId: string;
    awayTeamName: string;
    venueId: string | null;
    venueName: string | null;
    kickoffAt: string;
    matchweek: number;
    duplicate: boolean;
  };
}

export interface CsvImportState extends ActionState {
  rows?: CsvPreviewRow[];
  validCount?: number;
  errorCount?: number;
  duplicateCount?: number;
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
      error: `CSV header is missing: ${missing.join(", ")}. Expected columns: matchweek, kickoff, division, home, away, venue.`,
      csv,
      seasonId,
    };
  }

  const [divisions, teams, venues, existing] = await Promise.all([
    prisma.division.findMany({ where: { seasonId }, select: { id: true, name: true, slug: true } }),
    prisma.team.findMany({
      where: { division: { seasonId } },
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
    prisma.venue.findMany({ select: { id: true, name: true, slug: true } }),
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
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const venueIndex = new Map<string, (typeof venues)[number]>();
  for (const v of venues) {
    venueIndex.set(key(v.name), v);
    venueIndex.set(key(v.slug), v);
  }
  const existingKeys = new Set(
    existing.map((m) => `${m.matchweek}|${m.homeTeamId}|${m.awayTeamId}`),
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

    const division = divisionIndex.get(key(parsed.data.division));
    const home = teamIndex.get(key(parsed.data.home));
    const away = teamIndex.get(key(parsed.data.away));
    const venue = parsed.data.venue ? venueIndex.get(key(parsed.data.venue)) : undefined;
    const kickoff = parseLeagueDateTime(parsed.data.kickoff);

    const problems: string[] = [];
    if (!division) problems.push(`unknown division “${parsed.data.division}”`);
    if (!home) problems.push(`unknown home team “${parsed.data.home}”`);
    if (!away) problems.push(`unknown away team “${parsed.data.away}”`);
    if (home && away && home.id === away.id) problems.push("a team cannot play itself");
    if (parsed.data.venue && !venue) problems.push(`unknown venue “${parsed.data.venue}”`);
    if (!kickoff)
      problems.push(
        `unreadable kick-off “${parsed.data.kickoff}” — use YYYY-MM-DD HH:mm (Redmond time)`,
      );
    if (division && home && home.divisionId !== division.id) {
      problems.push(`${home.name} is not in ${division.name}`);
    }
    if (division && away && away.divisionId !== division.id) {
      problems.push(`${away.name} is not in ${division.name}`);
    }

    if (problems.length > 0 || !division || !home || !away || !kickoff) {
      rows.push({ line: i + 1, raw, error: problems.join("; ") });
      continue;
    }

    rows.push({
      line: i + 1,
      raw,
      resolved: {
        divisionId: division.id,
        divisionName: division.name,
        homeTeamId: home.id,
        homeTeamName: home.name,
        awayTeamId: away.id,
        awayTeamName: away.name,
        venueId: venue?.id ?? null,
        venueName: venue?.name ?? null,
        kickoffAt: kickoff.toISOString(),
        matchweek: parsed.data.matchweek,
        duplicate: existingKeys.has(`${parsed.data.matchweek}|${home.id}|${away.id}`),
      },
    });
  }

  const importable = rows.filter((r) => r.resolved && !r.resolved.duplicate);
  const errorCount = rows.filter((r) => r.error).length;
  const duplicateCount = rows.filter((r) => r.resolved?.duplicate).length;

  const summary: CsvImportState = {
    rows,
    validCount: importable.length,
    errorCount,
    duplicateCount,
    csv,
    seasonId,
  };

  if (!commit) {
    return {
      ...summary,
      ok: `Dry run: ${importable.length} fixture(s) ready to import, ${duplicateCount} duplicate(s) skipped, ${errorCount} row(s) with errors.`,
    };
  }

  if (errorCount > 0) {
    return { ...summary, error: "Fix every row error before importing." };
  }
  if (importable.length === 0) {
    return { ...summary, error: "Nothing new to import." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.createMany({
      data: importable.map((row) => ({
        seasonId,
        divisionId: row.resolved!.divisionId,
        homeTeamId: row.resolved!.homeTeamId,
        awayTeamId: row.resolved!.awayTeamId,
        venueId: row.resolved!.venueId,
        kickoffAt: new Date(row.resolved!.kickoffAt),
        matchweek: row.resolved!.matchweek,
        status: "SCHEDULED",
        ...pickKitsForFixture(
          teamById.get(row.resolved!.homeTeamId),
          teamById.get(row.resolved!.awayTeamId),
        ),
      })),
    });
    await writeAudit(tx, {
      actor: actorFrom(actor),
      action: "schedule.import",
      entity: "Season",
      entityId: seasonId,
      metadata: { imported: importable.length, skippedDuplicates: duplicateCount },
    });
  });

  refreshAdmin();
  return {
    ...summary,
    rows: undefined,
    csv: "",
    ok: `Imported ${importable.length} fixture(s).`,
    committed: true,
  };
}
