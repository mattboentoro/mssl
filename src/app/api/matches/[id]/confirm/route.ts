import { actorFrom, handleMatchMutation } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { confirmGameReport } from "@/lib/matches";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return handleMatchMutation(async () => {
    const { id } = await context.params;
    const user = await requireAdmin();

    await confirmGameReport(prisma, { matchId: id, actor: actorFrom(user) });

    return { ok: true, matchId: id, message: "Report confirmed." };
  });
}
