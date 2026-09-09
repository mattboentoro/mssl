import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { updateMatchSchedule } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { matchUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Reschedule, postpone or cancel a match. Admin only. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const body = await parseJson(request, matchUpdateSchema);

    await updateMatchSchedule(prisma, {
      matchId: id,
      actor: actorFrom(user),
      kickoffAt: body.kickoffAt ? new Date(body.kickoffAt) : undefined,
      venueId: body.venueId,
      status: body.status,
      reason: body.reason,
    });

    return { ok: true, matchId: id, message: "Match updated." };
  });
}
