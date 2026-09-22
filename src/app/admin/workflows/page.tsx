import type { Metadata } from "next";

import {
  reviewCaptainResultAdminAction,
  reviewRescheduleAction,
  reviewScoreAppealAction,
} from "@/app/admin/workflows/actions";
import { AdminWorkflowReview } from "@/components/admin-workflow-review";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Workflow reviews" };
export const dynamic = "force-dynamic";

function Result({
  home,
  away,
  homeScore,
  awayScore,
  homeForfeit,
  awayForfeit,
}: {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeForfeit: boolean;
  awayForfeit: boolean;
}) {
  return (
    <p className="font-medium">
      {home} {homeScore}&ndash;{awayScore} {away}
      {homeForfeit || awayForfeit ? (
        <Badge tone="warning" className="ml-2">
          forfeit
        </Badge>
      ) : null}
    </p>
  );
}

export default async function AdminWorkflowsPage() {
  const [reschedules, results, appeals] = await Promise.all([
    prisma.rescheduleRequest.findMany({
      where: { status: "PENDING_ADMIN" },
      include: {
        requestingTeam: { select: { name: true } },
        requestedBy: { select: { displayName: true, email: true } },
        respondedBy: { select: { displayName: true } },
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.captainResultProposal.findMany({
      where: { status: "PENDING_ADMIN" },
      include: {
        submittedTeam: { select: { name: true } },
        submittedBy: { select: { displayName: true, email: true } },
        confirmedBy: { select: { displayName: true } },
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scoreAppeal.findMany({
      where: { status: "PENDING" },
      include: {
        team: { select: { name: true } },
        submittedBy: { select: { displayName: true, email: true } },
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            report: {
              select: { homeScore: true, awayScore: true, homeForfeit: true, awayForfeit: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Workflow reviews"
        description="Final league decisions. Every item is revalidated on submit; stale fixtures and results are never silently overwritten."
      />
      <div className="space-y-8">
        <section aria-labelledby="reschedules">
          <h2 id="reschedules" className="mb-3 text-lg font-semibold">
            Reschedules awaiting Admin ({reschedules.length})
          </h2>
          <div className="grid gap-3">
            {reschedules.map((request) => (
              <AdminWorkflowReview
                key={request.id}
                title={`${request.match.homeTeam.name} v ${request.match.awayTeam.name}`}
                matchId={request.matchId}
                action={reviewRescheduleAction}
                idName="requestId"
                idValue={request.id}
                noteName="reviewNote"
              >
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Current fixture</dt>
                    <dd>
                      {formatDateTime(request.match.kickoffAt)} · {request.match.venueName || "TBD"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Original snapshot</dt>
                    <dd>
                      {request.originalKickoffAt
                        ? formatDateTime(request.originalKickoffAt)
                        : "Unavailable"}{" "}
                      · {request.originalVenueName || "TBD"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Requested</dt>
                    <dd>
                      {request.proposedKickoffAt
                        ? formatDateTime(request.proposedKickoffAt)
                        : "Unavailable"}{" "}
                      · {request.proposedVenueName || request.originalVenueName || "TBD"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Requested by</dt>
                    <dd>
                      {request.requestedBy.displayName} ({request.requestingTeam.name})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Opponent confirmation</dt>
                    <dd>
                      {request.respondedBy?.displayName ?? "Recorded"}
                      {request.responseNote ? ` — ${request.responseNote}` : ""}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm">
                  <span className="text-muted">Reason:</span> {request.reason}
                </p>
              </AdminWorkflowReview>
            ))}
            {!reschedules.length ? (
              <Card className="p-5">
                <EmptyState title="No agreed reschedules need review" />
              </Card>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="captain-results">
          <h2 id="captain-results" className="mb-3 text-lg font-semibold">
            No-referee results awaiting Admin ({results.length})
          </h2>
          <div className="grid gap-3">
            {results.map((proposal) => (
              <AdminWorkflowReview
                key={proposal.id}
                title={`${proposal.match.homeTeam.name} v ${proposal.match.awayTeam.name}`}
                matchId={proposal.matchId}
                action={reviewCaptainResultAdminAction}
                idName="proposalId"
                idValue={proposal.id}
                noteName="reviewNote"
              >
                <Result
                  home={proposal.match.homeTeam.name}
                  away={proposal.match.awayTeam.name}
                  homeScore={proposal.homeScore}
                  awayScore={proposal.awayScore}
                  homeForfeit={proposal.homeForfeit}
                  awayForfeit={proposal.awayForfeit}
                />
                <p className="text-muted mt-1 text-sm">
                  Current fixture: {formatDateTime(proposal.match.kickoffAt)} · Proposed by{" "}
                  {proposal.submittedBy.displayName} ({proposal.submittedTeam.name}); confirmed by{" "}
                  {proposal.confirmedBy?.displayName ?? "opponent Captain"}.
                </p>
                {proposal.notes ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap">Captain note: {proposal.notes}</p>
                ) : null}
              </AdminWorkflowReview>
            ))}
            {!results.length ? (
              <Card className="p-5">
                <EmptyState title="No Captain results need review" />
              </Card>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="appeals">
          <h2 id="appeals" className="mb-3 text-lg font-semibold">
            Score appeals awaiting Admin ({appeals.length})
          </h2>
          <div className="grid gap-3">
            {appeals.map((appeal) => (
              <AdminWorkflowReview
                key={appeal.id}
                title={`${appeal.match.homeTeam.name} v ${appeal.match.awayTeam.name}`}
                matchId={appeal.matchId}
                action={reviewScoreAppealAction}
                idName="appealId"
                idValue={appeal.id}
                noteName="resolutionNote"
                noteRequired
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">
                      Current official result
                    </p>
                    {appeal.match.report ? (
                      <Result
                        home={appeal.match.homeTeam.name}
                        away={appeal.match.awayTeam.name}
                        homeScore={appeal.match.report.homeScore}
                        awayScore={appeal.match.report.awayScore}
                        homeForfeit={appeal.match.report.homeForfeit}
                        awayForfeit={appeal.match.report.awayForfeit}
                      />
                    ) : (
                      <p className="text-danger">Report no longer exists</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">Original snapshot</p>
                    <Result
                      home={appeal.match.homeTeam.name}
                      away={appeal.match.awayTeam.name}
                      homeScore={appeal.originalHomeScore}
                      awayScore={appeal.originalAwayScore}
                      homeForfeit={appeal.originalHomeForfeit}
                      awayForfeit={appeal.originalAwayForfeit}
                    />
                  </div>
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">
                      Requested correction
                    </p>
                    <Result
                      home={appeal.match.homeTeam.name}
                      away={appeal.match.awayTeam.name}
                      homeScore={appeal.requestedHomeScore}
                      awayScore={appeal.requestedAwayScore}
                      homeForfeit={appeal.requestedHomeForfeit}
                      awayForfeit={appeal.requestedAwayForfeit}
                    />
                  </div>
                </div>
                <p className="text-muted mt-2 text-sm">
                  Appealed by {appeal.submittedBy.displayName} ({appeal.team.name})
                </p>
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  <span className="text-muted">Reason:</span> {appeal.reason}
                </p>
              </AdminWorkflowReview>
            ))}
            {!appeals.length ? (
              <Card className="p-5">
                <EmptyState title="No score appeals need review" />
              </Card>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
