import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { adminAssignReferee } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { adminAssignSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Assign or force-unassign a referee. Admin only; pass `refereeId: null` to clear. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const body = await parseJson(request, adminAssignSchema);

    await adminAssignReferee(prisma, {
      matchId: id,
      refereeId: body.refereeId,
      actor: actorFrom(user),
      reason: body.reason,
    });

    return {
      ok: true,
      matchId: id,
      message: body.refereeId ? "Referee assigned." : "Referee removed from this match.",
    };
  });
}
