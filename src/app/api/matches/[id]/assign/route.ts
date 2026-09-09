import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireReferee } from "@/lib/authz";
import { assignRefereeToMatch } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { assignSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Referee self-assignment.
 *
 * Authorization is re-checked server-side on every call: `requireReferee()`
 * re-reads the signed session and, if the cached Graph decision has expired,
 * re-queries `msslrefs` membership. A client that fakes a role gets a 403 here.
 *
 * Returns 409 ALREADY_ASSIGNED when another referee won the race.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const { user, referee } = await requireReferee();
    const body = await parseJson(request, assignSchema);

    const result = await assignRefereeToMatch(prisma, {
      matchId: id,
      refereeId: referee.id,
      expectedVersion: body.expectedVersion,
      actor: actorFrom(user, referee.id),
    });

    return {
      ok: true,
      alreadyOwned: result.alreadyOwned,
      matchId: result.matchId,
      version: result.version,
      message: result.alreadyOwned
        ? "You were already assigned to this match."
        : "You are now the referee for this match.",
    };
  });
}
