import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireReferee } from "@/lib/authz";
import { unassignReferee } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { unassignSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Give a match back. The assigned referee may release it right up until the
 * game report is filed; once a report exists only an admin can reverse it.
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
