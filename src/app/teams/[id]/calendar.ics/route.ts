import { CALENDAR_MATCH_INCLUDE, calendarResponse, serializeCalendar } from "@/lib/ical";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const team = await prisma.team.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, slug: true, name: true },
  });
  if (!team) return new Response("Team not found", { status: 404 });

  const seasonParam = url.searchParams.get("season");
  const season = seasonParam
    ? await prisma.season.findFirst({
        where: { OR: [{ id: seasonParam }, { slug: seasonParam }] },
      })
    : await getActiveSeason();
  if (!season) return new Response("Season not found", { status: 404 });

  const matches = await prisma.match.findMany({
    where: {
      seasonId: season.id,
      OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
    },
    include: CALENDAR_MATCH_INCLUDE,
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
  });
  return calendarResponse(
    serializeCalendar({ name: `${team.name} - ${season.name}`, matches }),
    `mssl-${team.slug}-${season.slug}.ics`,
  );
}
