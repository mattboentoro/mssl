import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import {
  RescheduleCancelForm,
  RescheduleProposalForm,
  RescheduleResponseForm,
  RescheduleRevisionForm,
} from "@/components/reschedule-forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { formatDateTime, toDateTimeInputValue } from "@/lib/dates";
import { RESCHEDULE_STATUS_LABELS, type RescheduleStatus } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { listReschedulesForCaptain, OPEN_RESCHEDULE_STATUSES } from "@/lib/reschedules";

export const metadata: Metadata = { title: "Fixture reschedules" };
export const dynamic = "force-dynamic";

export default async function CaptainReschedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string; team?: string }>;
}) {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/captain/reschedules");
      forbidden();
    }
    throw error;
  }
  const params = await searchParams;
  const { eligibleMatches, requests, contexts } = await listReschedulesForCaptain(
    prisma,
    user.appUserId,
  );
  const contextKeys = new Set(contexts.map(({ seasonId, teamId }) => `${seasonId}:${teamId}`));
  const openMatchIds = new Set(
    requests
      .filter((request) =>
        OPEN_RESCHEDULE_STATUSES.includes(
          request.status as (typeof OPEN_RESCHEDULE_STATUSES)[number],
        ),
      )
      .map((request) => request.matchId),
  );
  const fixtures = eligibleMatches.flatMap((match) =>
    contexts
      .filter(
        ({ seasonId, teamId }) =>
          seasonId === match.seasonId &&
          (teamId === match.homeTeamId || teamId === match.awayTeamId) &&
          !openMatchIds.has(match.id),
      )
      .map(({ teamId }) => ({
        id: match.id,
        requestingTeamId: teamId,
        label: `${formatDateTime(match.kickoffAt)} — ${match.homeTeam.name} v ${match.awayTeam.name}`,
      })),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Captain"
        title="Fixture reschedules"
        description="Propose a future kickoff for the opposing team. The fixture changes only after the opponent and league both approve."
      />
      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-lg font-semibold">New proposal</h2>
        {fixtures.length ? (
          <RescheduleProposalForm
            fixtures={fixtures}
            selectedMatchId={params.match}
            selectedTeamId={params.team}
          />
        ) : (
          <EmptyState
            title="No eligible fixtures"
            hint="Only future, unfinished fixtures without another open request are available."
          />
        )}
      </Card>

      <section aria-labelledby="reschedule-history">
        <h2 id="reschedule-history" className="mb-3 text-lg font-semibold">
          Requests
        </h2>
        {requests.length === 0 ? (
          <EmptyState title="No reschedule requests yet" />
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const isProposingCaptain =
                request.requestedById === user.appUserId &&
                contextKeys.has(`${request.match.seasonId}:${request.requestingTeamId}`);
              const opponentId =
                request.match.homeTeamId === request.requestingTeamId
                  ? request.match.awayTeamId
                  : request.match.homeTeamId;
              const canRespond =
                request.status === "PENDING_OPPONENT" &&
                contextKeys.has(`${request.match.seasonId}:${opponentId}`);
              return (
                <div key={request.id} id={`request-${request.id}`}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-muted text-xs">
                          Proposed by {request.requestingTeam.name} (
                          {request.requestedBy.displayName})
                        </p>
                        <h3 className="mt-1 font-semibold">
                          {request.match.homeTeam.name} v {request.match.awayTeam.name}
                        </h3>
                      </div>
                      <Badge
                        tone={
                          request.status === "APPROVED"
                            ? "success"
                            : request.status.startsWith("REJECTED")
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {RESCHEDULE_STATUS_LABELS[request.status as RescheduleStatus] ??
                          request.status}
                      </Badge>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted text-xs">Current kickoff</dt>
                        <dd>
                          {formatDateTime(request.originalKickoffAt ?? request.match.kickoffAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs">Proposed kickoff</dt>
                        <dd>
                          {request.proposedKickoffAt
                            ? formatDateTime(request.proposedKickoffAt)
                            : "Not provided"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs">Current venue</dt>
                        <dd>{request.originalVenueName ?? "TBD"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted text-xs">Proposed venue</dt>
                        <dd>{request.proposedVenueName ?? "No change"}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm">
                      <span className="font-medium">Rationale:</span> {request.reason}
                    </p>
                    {request.responseNote ? (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Opponent note:</span> {request.responseNote}
                      </p>
                    ) : null}
                    {request.adminReviewNote ? (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">League note:</span> {request.adminReviewNote}
                      </p>
                    ) : null}
                    {isProposingCaptain &&
                    request.status === "PENDING_OPPONENT" &&
                    request.proposedKickoffAt ? (
                      <>
                        <RescheduleRevisionForm
                          requestId={request.id}
                          kickoff={toDateTimeInputValue(request.proposedKickoffAt)}
                          venue={request.proposedVenueName}
                          reason={request.reason}
                        />
                        <RescheduleCancelForm requestId={request.id} />
                      </>
                    ) : null}
                    {canRespond ? <RescheduleResponseForm requestId={request.id} /> : null}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
