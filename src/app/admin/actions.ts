"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { actorFrom } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import { AuthzError, requireAdmin } from "@/lib/authz";
import { addDisciplinaryAction, deleteDisciplinaryAction } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import {
  announcementSchema,
  csvMatchRowSchema,
  disciplinaryActionSchema,
  divisionSchema,
  documentSchema,
  flattenZodError,
  matchCreateSchema,
  seasonSchema,
  teamSchema,
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
      crestEmoji: str(form, "crestEmoji") || "\u26BD",
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
  return run(
    z.object({ id: z.string().min(1) }),
    { id: str(form, "id") },
    async (data, actor) => {
      await deleteDisciplinaryAction(prisma, { id: data.id, actor: actorFrom(actor) });
      refreshAdmin();
      return "Disciplinary record rescinded.";
    },
  );
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
      notes: optional(form, "notes"),
    },
    async (data, actor) => {
      if (data.homeTeamId === data.awayTeamId) {
        throw new Error("A team cannot play itself.");
      }
      const kickoff = new Date(data.kickoffAt);
      if (Number.isNaN(kickoff.getTime())) throw new Error("Kick-off date is not valid.");

      const match = await prisma.match.create({
        data: {
          seasonId: data.seasonId,
          divisionId: data.divisionId,
          homeTeamId: data.homeTeamId,
          awayTeamId: data.awayTeamId,
          venueId: data.venueId ?? null,
          kickoffAt: kickoff,
          matchweek: data.matchweek,
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
      select: { id: true, name: true, slug: true, shortName: true, divisionId: true },
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
    const kickoff = new Date(parsed.data.kickoff);

    const problems: string[] = [];
    if (!division) problems.push(`unknown division “${parsed.data.division}”`);
    if (!home) problems.push(`unknown home team “${parsed.data.home}”`);
    if (!away) problems.push(`unknown away team “${parsed.data.away}”`);
    if (home && away && home.id === away.id) problems.push("a team cannot play itself");
    if (parsed.data.venue && !venue) problems.push(`unknown venue “${parsed.data.venue}”`);
    if (Number.isNaN(kickoff.getTime()))
      problems.push(`unreadable kick-off “${parsed.data.kickoff}”`);
    if (division && home && home.divisionId !== division.id) {
      problems.push(`${home.name} is not in ${division.name}`);
    }
    if (division && away && away.divisionId !== division.id) {
      problems.push(`${away.name} is not in ${division.name}`);
    }

    if (problems.length > 0 || !division || !home || !away) {
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
