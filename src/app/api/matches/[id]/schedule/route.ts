import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { MatchError, updateMatchSchedule } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { parseLeagueDateTime } from "@/lib/timezone";
import { matchUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Reschedule, postpone, cancel or re-kit a match. Admin only. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const body = await parseJson(request, matchUpdateSchema);

    // Wall-clock strings from the admin form are league time, not browser time.
    const kickoffAt = body.kickoffAt ? parseLeagueDateTime(body.kickoffAt) : undefined;
    if (body.kickoffAt && !kickoffAt)
      throw new MatchError("Kick-off date is not valid.", 400, "INVALID_STATE");

    await updateMatchSchedule(prisma, {
      matchId: id,
      actor: actorFrom(user),
      kickoffAt: kickoffAt ?? undefined,
      venueName: body.venueName,
      status: body.status,
      matchweek: body.matchweek,
      countsForStandings: body.countsForStandings,
      homeKit: body.homeKit,
      awayKit: body.awayKit,
      reason: body.reason,
    });

    return { ok: true, matchId: id, message: "Match updated." };
  });
}
