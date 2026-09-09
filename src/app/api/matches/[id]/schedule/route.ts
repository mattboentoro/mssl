import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { forceUnlockMatch, updateMatchSchedule } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { matchUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Reschedule, postpone, cancel or force-unlock a match. Admin only. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const body = await parseJson(request, matchUpdateSchema);
    const actor = actorFrom(user);

    // Moving a locked match back to SCHEDULED/ASSIGNED is the force-unlock path,
    // which keeps its own audit action and mandatory reason.
    const match = await prisma.match.findUnique({ where: { id }, select: { status: true } });
    if (match?.status === "LOCKED" && body.status && body.status !== "LOCKED") {
      await forceUnlockMatch(prisma, {
        matchId: id,
        actor,
        reason: body.reason ?? "Force-unlocked by an administrator.",
      });
    }

    await updateMatchSchedule(prisma, {
      matchId: id,
      actor,
      kickoffAt: body.kickoffAt ? new Date(body.kickoffAt) : undefined,
      venueId: body.venueId,
      status: body.status,
      reason: body.reason,
    });

    return { ok: true, matchId: id, message: "Match updated." };
  });
}
