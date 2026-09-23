import { CALENDAR_MATCH_INCLUDE, calendarResponse, serializeCalendar } from "@/lib/ical";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: CALENDAR_MATCH_INCLUDE,
  });
  if (!match) return new Response("Match not found", { status: 404 });

  return calendarResponse(
    serializeCalendar({
      name: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
      matches: [match],
    }),
    `mssl-match-${match.id}.ics`,
    "public, max-age=0, must-revalidate",
  );
}
