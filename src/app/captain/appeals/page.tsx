import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { MatchHeadToHead, MatchScore } from "@/components/match-display";
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
        backHref="/captain"
        backLabel="Captain dashboard"
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
              <Card
                as="details"
                key={`${match.id}-${match.teamId}`}
                className="group overflow-hidden"
              >
                <summary className="hover:bg-surface-muted cursor-pointer list-none px-5 py-4 transition">
                  <MatchHeadToHead
                    home={{ name: match.homeTeam.name }}
                    away={{ name: match.awayTeam.name }}
                    center={<MatchScore home={report.homeScore} away={report.awayScore} />}
                    topLeft={match.division.name}
                    topRight={`MW ${match.matchweek}`}
                    time={formatDateTime(match.kickoffAt)}
                    status={<Badge tone="success">Official</Badge>}
                    location={<>&#128205; {match.venueName ?? "TBD"}</>}
                  />
                </summary>
                <div className="border-subtle border-t p-5">
                  <p className="text-muted mb-4 text-sm">
                    Appealing as{" "}
                    <strong>
                      {match.teamId === match.homeTeam.id
                        ? match.homeTeam.name
                        : match.awayTeam.name}
                    </strong>
                  </p>
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
                </div>
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
            <Card as="details" key={appeal.id} className="group overflow-hidden">
              <summary className="hover:bg-surface-muted cursor-pointer list-none px-5 py-4 transition">
                <MatchHeadToHead
                  home={{ name: appeal.match.homeTeam.name }}
                  away={{ name: appeal.match.awayTeam.name }}
                  center={
                    <MatchScore
                      home={appeal.originalHomeScore}
                      away={appeal.originalAwayScore}
                      label="Original score"
                    />
                  }
                  topLeft={appeal.match.division.name}
                  topRight={`MW ${appeal.match.matchweek}`}
                  time={formatDateTime(appeal.match.kickoffAt)}
                  status={
                    <Badge tone={statusTone(appeal.status)}>
                      {appeal.status.replaceAll("_", " ")}
                    </Badge>
                  }
                  location={<>&#128205; {appeal.match.venueName ?? "TBD"}</>}
                />
              </summary>
              <div className="border-subtle border-t p-5">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="bg-surface-muted rounded-lg p-3">
                    <dt className="text-muted">Original result</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {appeal.originalHomeScore}&ndash;{appeal.originalAwayScore}
                      {appeal.originalHomeForfeit || appeal.originalAwayForfeit ? " (forfeit)" : ""}
                    </dd>
                  </div>
                  <div className="bg-surface-muted rounded-lg p-3">
                    <dt className="text-muted">Requested result</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {appeal.requestedHomeScore}&ndash;{appeal.requestedAwayScore}
                      {appeal.requestedHomeForfeit || appeal.requestedAwayForfeit
                        ? " (forfeit)"
                        : ""}
                    </dd>
                  </div>
                </dl>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">Appealed by</dt>
                    <dd>{appeal.team.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Submitted</dt>
                    <dd>{formatDateTime(appeal.createdAt)}</dd>
                  </div>
                </dl>
                <div className="mt-4 text-sm">
                  <p className="text-muted">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap">{appeal.reason}</p>
                </div>
                {appeal.decisionNote ? (
                  <div className="mt-4 text-sm">
                    <p className="text-muted">Resolution</p>
                    <p className="mt-1 whitespace-pre-wrap">{appeal.decisionNote}</p>
                  </div>
                ) : null}
                {appeal.status === "PENDING" ? (
                  <CancelScoreAppealForm appealId={appeal.id} />
                ) : null}
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No appeals submitted" />
        )}
      </section>
    </div>
  );
}
