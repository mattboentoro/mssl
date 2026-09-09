import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { forceUnlockMatch } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { reasonSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Admin-only reversal of a referee's lock. A reason is mandatory and audited. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const { reason } = await parseJson(request, reasonSchema);

    await forceUnlockMatch(prisma, { matchId: id, actor: actorFrom(user), reason });

    return { ok: true, matchId: id, message: "Match unlocked." };
  });
}
