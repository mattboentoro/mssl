import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { overrideGameReport } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { overrideSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Admin result override. The reason is mandatory and is written to the audit log. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const body = await parseJson(request, overrideSchema);

    await overrideGameReport(prisma, {
      matchId: id,
      actor: actorFrom(user),
      reason: body.reason,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      homeForfeit: body.homeForfeit,
      awayForfeit: body.awayForfeit,
    });

    return { ok: true, matchId: id, message: "Result overridden and recorded in the audit log." };
  });
}
