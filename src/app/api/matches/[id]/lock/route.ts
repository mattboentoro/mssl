import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireReferee } from "@/lib/authz";
import { lockMatch } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { lockSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Lock a match. Only the assigned referee (or an admin) may do this; locking
 * freezes the fixture and rosters and blocks reassignment. After this point
 * only an admin can reverse it.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const { user, referee } = await requireReferee();
    const body = await parseJson(request, lockSchema);

    const result = await lockMatch(prisma, {
      matchId: id,
      actor: actorFrom(user, referee.id),
      expectedVersion: body.expectedVersion,
    });

    return {
      ok: true,
      matchId: id,
      version: result.version,
      message: "Match locked. The fixture and rosters are now frozen.",
    };
  });
}
