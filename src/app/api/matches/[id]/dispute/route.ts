import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { disputeGameReport } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { reasonSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();
    const { reason } = await parseJson(request, reasonSchema);

    await disputeGameReport(prisma, { matchId: id, actor: actorFrom(user), reason });

    return {
      ok: true,
      matchId: id,
      message: "Report disputed. It no longer counts towards the standings.",
    };
  });
}
