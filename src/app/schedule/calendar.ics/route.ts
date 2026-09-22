import { CALENDAR_MATCH_INCLUDE, calendarResponse, serializeCalendar } from "@/lib/ical";
import { prisma } from "@/lib/prisma";
import { resolveSeason } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = await resolveSeason(url.searchParams.get("season") ?? undefined);

  if (!season) {
    return new Response("No season available", { status: 404 });
  }

  const division = url.searchParams.get("division");
  const team = url.searchParams.get("team");

  const where: Record<string, unknown> = {
    seasonId: season.id,
    status: { notIn: ["CANCELLED"] },
  };
  if (division) where.divisionId = division;
  if (team) where.OR = [{ homeTeamId: team }, { awayTeamId: team }];

  const matches = await prisma.match.findMany({
    where,
    include: CALENDAR_MATCH_INCLUDE,
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
  });
  return calendarResponse(
    serializeCalendar({ name: `MSSL ${season.name}`, matches }),
    `mssl-${season.slug}.ics`,
  );
}
