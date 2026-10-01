import { AuthzError, requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { resolveSeason } from "@/lib/queries";
import { buildAdminMatchCsv } from "@/lib/schedule-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a season's fixtures as CSV.
 *
 * Core fixture columns remain compatible with the schedule importer. Referee
 * and status are informational columns that the importer safely ignores.
 * Kick-offs are written as Redmond wall-clock time with no offset.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthzError) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }

  const url = new URL(request.url);
  const season = await resolveSeason(url.searchParams.get("season") ?? undefined);
  if (!season) return new Response("No season available", { status: 404 });

  const matches = await prisma.match.findMany({
    where: { seasonId: season.id },
    // Kick-off order, not matchweek order: matchweek is free text now, so
    // "Final" and "10" would sort as words rather than as a season.
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    include: {
      division: { select: { name: true } },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      referee: { select: { name: true } },
    },
  });

  return new Response(buildAdminMatchCsv(matches), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mssl-schedule-${season.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
