import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { CancelScoreAppealForm, ScoreAppealForm } from "@/components/score-appeal-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listScoreAppealsForCaptain } from "@/lib/score-appeals";

export const metadata: Metadata = { title: "Score appeals" };
export const dynamic = "force-dynamic";

const statusTone = (status: string) => {
  if (status === "ACCEPTED") return "success" as const;
  if (status === "REJECTED" || status === "CANCELLED") return "danger" as const;
  return "warning" as const;
};

export default async function CaptainAppealsPage() {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/captain/appeals");
      forbidden();
    }
    throw error;
  }

  const { eligible, appeals } = await listScoreAppealsForCaptain(prisma, user.appUserId);
  return (
    <div>
      <PageHeader
        eyebrow="Captain"
        title="Score appeals"
        description="Appeal an official result for your team. Appeals have no elapsed-time or season-close deadline."
      />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Official results</h2>
        {eligible.length ? (
          eligible.map((match) => {
            const report = match.report!;
            return (
              <Card key={`${match.id}-${match.teamId}`} className="p-5">
                <p className="text-muted text-xs">
                  {formatDateTime(match.kickoffAt)} &middot; Appealing as{" "}
                  {match.teamId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name}
                </p>
                <h3 className="mt-1 text-lg font-semibold">
                  {match.homeTeam.name} {report.homeScore}&ndash;{report.awayScore}{" "}
                  {match.awayTeam.name}
                </h3>
                <ScoreAppealForm
                  matchId={match.id}
                  teamId={match.teamId}
                  homeTeamName={match.homeTeam.name}
                  awayTeamName={match.awayTeam.name}
                  homeScore={report.homeScore}
                  awayScore={report.awayScore}
                  homeForfeit={report.homeForfeit}
                  awayForfeit={report.awayForfeit}
                />
              </Card>
            );
          })
        ) : (
          <EmptyState
            title="No official results are available to appeal"
            hint="A match disappears from this list while your team has a pending appeal."
          />
        )}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold">Appeal history</h2>
        {appeals.length ? (
          appeals.map((appeal) => (
            <Card key={appeal.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-muted text-xs">
                    {formatDateTime(appeal.createdAt)} &middot; {appeal.team.name}
                  </p>
                  <h3 className="mt-1 font-semibold">
                    {appeal.match.homeTeam.name} v {appeal.match.awayTeam.name}
                  </h3>
                </div>
                <Badge tone={statusTone(appeal.status)}>{appeal.status}</Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Original</dt>
                  <dd>
                    {appeal.originalHomeScore}&ndash;{appeal.originalAwayScore}
                    {appeal.originalHomeForfeit || appeal.originalAwayForfeit ? " (forfeit)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Requested</dt>
                  <dd>
                    {appeal.requestedHomeScore}&ndash;{appeal.requestedAwayScore}
                    {appeal.requestedHomeForfeit || appeal.requestedAwayForfeit ? " (forfeit)" : ""}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-sm">{appeal.reason}</p>
              {appeal.decisionNote ? (
                <p className="text-muted mt-3 text-sm">
                  <strong>Resolution:</strong> {appeal.decisionNote}
                </p>
              ) : null}
              {appeal.status === "PENDING" ? <CancelScoreAppealForm appealId={appeal.id} /> : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No appeals submitted" />
        )}
      </section>
    </div>
  );
}
