import { AuthzError, requireAdmin } from "@/lib/authz";
import { toCsvRow } from "@/lib/csv";
import { toDateInputValue, formatTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { resolveSeason } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Header the schedule importer expects. Keep the two in lock-step. */
const HEADER = ["matchweek", "kickoff", "division", "home", "away", "venue"];

/**
 * Download a season's fixtures as CSV.
 *
 * Deliberately round-trips through the importer: the header and the kick-off
 * format are exactly what `importScheduleAction` reads back, so an organiser
 * can export, edit in Excel, and re-upload. Kick-offs are written as Redmond
 * wall-clock time with no offset — the same thing the importer assumes.
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
    orderBy: [{ matchweek: "asc" }, { kickoffAt: "asc" }],
    include: {
      division: { select: { name: true } },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const lines = [toCsvRow(HEADER)];
  for (const match of matches) {
    lines.push(
      toCsvRow([
        String(match.matchweek),
        `${toDateInputValue(match.kickoffAt)} ${formatTime(match.kickoffAt)}`,
        match.division.name,
        match.homeTeam.name,
        match.awayTeam.name,
        match.venueName ?? "",
      ]),
    );
  }

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mssl-schedule-${season.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
