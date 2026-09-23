import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";

import { CaptainResultForm, CaptainResultResponseForm } from "@/components/captain-result-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AuthzError, requireParticipantCaptain } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Captain match result" };
export const dynamic = "force-dynamic";

export default async function CaptainResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let context;
  try {
    context = await requireParticipantCaptain(id);
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect(`/signin?callbackUrl=/captain/results/${id}`);
      forbidden();
    }
    throw error;
  }
  const match = await prisma.match.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true, report: true, resultProposal: true },
  });
  if (!match) notFound();
  const proposal = match.resultProposal;
  const canRespond =
    proposal?.status === "PENDING_OPPONENT" && proposal.submittedTeamId !== context.teamId;
  const eligible =
    match.kickoffAt <= new Date() &&
    !match.refereeId &&
    !match.report &&
    match.status === "SCHEDULED";

  return (
    <div>
      <PageHeader
        backHref="/captain/results"
        backLabel="Match results"
        eyebrow="Captain result"
        title={`${match.homeTeam.name} v ${match.awayTeam.name}`}
        description={formatDateTime(match.kickoffAt)}
      />
      <Card className="p-6">
        {proposal ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-bold tabular-nums">
                {proposal.homeScore}–{proposal.awayScore}
              </p>
              <Badge>{proposal.status.replaceAll("_", " ")}</Badge>
            </div>
            {proposal.homeForfeit || proposal.awayForfeit ? (
              <p className="text-danger mt-2 text-sm">
                {proposal.homeForfeit ? match.homeTeam.name : match.awayTeam.name} forfeited.
              </p>
            ) : null}
            {proposal.notes ? (
              <p className="text-muted mt-3 whitespace-pre-wrap">{proposal.notes}</p>
            ) : null}
            {canRespond ? (
              <CaptainResultResponseForm matchId={id} proposalId={proposal.id} />
            ) : (
              <p className="text-muted mt-4 text-sm">
                {proposal.submittedTeamId === context.teamId &&
                proposal.status === "PENDING_OPPONENT"
                  ? "Waiting for the opposing Captain."
                  : proposal.status === "PENDING_ADMIN"
                    ? "Both teams agreed. Waiting for league approval."
                    : "This proposal is closed."}
              </p>
            )}
            {eligible && ["REJECTED_OPPONENT", "REJECTED_ADMIN"].includes(proposal.status) ? (
              <div className="border-subtle mt-5 border-t pt-5">
                <h2 className="font-semibold">Submit a corrected result</h2>
                <CaptainResultForm
                  matchId={id}
                  homeName={match.homeTeam.name}
                  awayName={match.awayTeam.name}
                />
              </div>
            ) : null}
          </>
        ) : eligible ? (
          <CaptainResultForm
            matchId={id}
            homeName={match.homeTeam.name}
            awayName={match.awayTeam.name}
          />
        ) : (
          <p className="text-muted text-sm">
            This match is not eligible for a Captain-submitted result.
          </p>
        )}
      </Card>
    </div>
  );
}
