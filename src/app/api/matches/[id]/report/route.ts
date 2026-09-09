import { actorFrom, handleApi, parseJson } from "@/lib/api";
import { requireReferee } from "@/lib/authz";
import { submitGameReport } from "@/lib/matches";
import { prisma } from "@/lib/prisma";
import { gameReportSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * File the game report.
 *
 * Zod checks the shape (non-negative integer scores, plausible minutes, at most
 * 200 events); `submitGameReport` then checks the things only the database can
 * know — that the caller owns the match, that it is locked, that every player
 * belongs to one of the two teams, and that the reported score agrees with the
 * itemised goals. On success the match moves to REPORT_SUBMITTED and the report
 * becomes read-only to the referee.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { id } = await context.params;
    const { user, referee } = await requireReferee();
    const input = await parseJson(request, gameReportSchema);

    const result = await submitGameReport(prisma, {
      matchId: id,
      refereeId: referee.id,
      actor: actorFrom(user, referee.id),
      input,
    });

    return {
      ok: true,
      matchId: id,
      reportId: result.reportId,
      message: "Game report submitted. The standings have been updated.",
    };
  });
}
