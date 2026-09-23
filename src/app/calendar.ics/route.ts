import { AuthzError, requireUser } from "@/lib/authz";
import { CALENDAR_MATCH_INCLUDE, calendarResponse, serializeCalendar } from "@/lib/ical";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthzError) {
      return new Response(error.message, {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    throw error;
  }

  const url = new URL(request.url);
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam
    ? await prisma.season.findFirst({
        where: { OR: [{ id: seasonParam }, { slug: seasonParam }] },
      })
    : await getActiveSeason();
  if (!season) {
    return new Response("Season not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const teamIds = [
    ...new Set(
      user.teamContexts
        .filter((context) => context.seasonId === season.id)
        .map((context) => context.teamId),
    ),
  ];
  const referee =
    user.isReferee && user.appUserId
      ? await prisma.referee.findFirst({
          where: { userId: user.appUserId, active: true },
          select: { id: true },
        })
      : null;
  const scopes = [
    ...teamIds.map((teamId) => ({ OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] })),
    ...(referee ? [{ refereeId: referee.id }] : []),
  ];

  const matches = scopes.length
    ? await prisma.match.findMany({
        where: { seasonId: season.id, OR: scopes },
        include: CALENDAR_MATCH_INCLUDE,
        orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
      })
    : [];

  return calendarResponse(
    serializeCalendar({ name: `My MSSL fixtures - ${season.name}`, matches }),
    `mssl-my-fixtures-${season.slug}.ics`,
    "private, no-store",
  );
}
