import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireReferee } from "@/lib/authz";
import { unassignReferee } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { unassignSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Give a match back. Allowed for the assigned referee *before* the lock; after
 * the lock `unassignReferee` rejects anyone who is not an admin.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const { user, referee } = await requireReferee();
    const body = await parseJson(request, unassignSchema);

    await unassignReferee(prisma, {
      matchId: id,
      actor: actorFrom(user, referee.id),
      reason: body.reason,
    });

    return {
      ok: true,
      matchId: id,
      message: "Match released. It is open to other referees again.",
    };
  });
}
