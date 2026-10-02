import Link from "next/link";
import { Suspense } from "react";

import { MatchHeadToHead, MatchScore } from "@/components/match-display";
import { SectionSkeleton } from "@/components/loading";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { displayedScore, getActiveSeason } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<SectionSkeleton label="League totals" cards={6} />}>
        <LeagueTotals />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Reports awaiting review" rows={3} />}>
        <PendingReports />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Workflow queues" cards={3} />}>
        <WorkflowQueues />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="Recent activity" rows={8} />}>
        <RecentActivity />
      </Suspense>
    </div>
  );
}

async function LeagueTotals() {
  const [season, counts, unassigned] = await Promise.all([
    getActiveSeason(),
    Promise.all([
      prisma.season.count(),
      prisma.team.count(),
      prisma.disciplinaryAction.count(),
      prisma.match.count(),
      prisma.gameReport.count(),
      prisma.referee.count({ where: { active: true } }),
    ]),
    prisma.match.count({ where: { refereeId: null, status: "SCHEDULED" } }),
  ]);

  const [seasons, teams, cards, matches, reports, referees] = counts;

  const stats = [
    { label: "Seasons", value: seasons },
    { label: "Teams", value: teams },
    { label: "Cards", value: cards },
    { label: "Fixtures", value: matches },
    { label: "Reports filed", value: reports },
    { label: "Active referees", value: referees },
  ];

  return (
    <section aria-labelledby="stats">
      <h2 id="stats" className="sr-only">
        League totals
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
            <p className="text-muted text-xs">{stat.label}</p>
          </Card>
        ))}
      </div>
      <p className="text-muted mt-3 text-sm">
        Active season: <strong>{season?.name ?? "none"}</strong> &middot; {unassigned} fixture(s)
        still need a referee.
      </p>
    </section>
  );
}

async function PendingReports() {
  const pending = await prisma.match.findMany({
    where: { status: "REPORT_SUBMITTED" },
    orderBy: { kickoffAt: "asc" },
    take: 12,
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      division: { select: { name: true } },
      referee: { select: { name: true } },
      report: {
        select: {
          homeScore: true,
          awayScore: true,
          homeForfeit: true,
          awayForfeit: true,
          submittedAt: true,
        },
      },
    },
  });
  return (
    <section aria-labelledby="pending-reports">
      <h2 id="pending-reports" className="mb-3 text-lg font-semibold">
        Reports awaiting review ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="Nothing to review"
            hint="Submitted game reports appear here for confirmation."
          />
        </Card>
      ) : (
        <Card className="divide-subtle divide-y">
          {pending.map((match) => {
            const score = displayedScore(match.report)!;
            return (
              <Link
                key={match.id}
                href={`/admin/matches/${match.id}`}
                className="hover:bg-surface-muted block p-4"
              >
                <MatchHeadToHead
                  home={{ name: match.homeTeam.name }}
                  away={{ name: match.awayTeam.name }}
                  center={<MatchScore home={score.home} away={score.away} />}
                  topLeft={match.division.name}
                  topRight={`MW ${match.matchweek}`}
                  time={formatDateTime(match.kickoffAt)}
                  status={<Badge tone="warning">Review</Badge>}
                  location={<>&#128205; {match.venueName ?? "TBD"}</>}
                />
                <p className="text-muted mt-2 text-center text-xs">
                  Filed by {match.referee?.name ?? "unknown"}
                </p>
              </Link>
            );
          })}
        </Card>
      )}
    </section>
  );
}

async function WorkflowQueues() {
  const workflowCounts = await Promise.all([
    prisma.rescheduleRequest.count({ where: { status: "PENDING_ADMIN" } }),
    prisma.captainResultProposal.count({ where: { status: "PENDING_ADMIN" } }),
    prisma.scoreAppeal.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <section aria-labelledby="workflow-queues">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="workflow-queues" className="text-lg font-semibold">
          RBAC workflow queues
        </h2>
        <Link href="/admin/workflows" className="text-brand text-sm hover:underline">
          Review all
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Agreed reschedules", count: workflowCounts[0] },
          { label: "Captain results", count: workflowCounts[1] },
          { label: "Score appeals", count: workflowCounts[2] },
        ].map((queue) => (
          <Link key={queue.label} href="/admin/workflows">
            <Card className="hover:bg-surface-muted p-4">
              <p className="text-2xl font-bold tabular-nums">{queue.count}</p>
              <p className="text-muted text-sm">{queue.label}</p>
            </Card>
          </Link>
        ))}
      </div>
      <p className="text-muted mt-3 text-sm">
        Participant updates are delivered through{" "}
        <Link href="/notifications" className="text-brand hover:underline">
          Notifications
        </Link>
        .
      </p>
    </section>
  );
}

async function RecentActivity() {
  const recentAudit = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  return (
    <section aria-labelledby="recent-audit">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="recent-audit" className="text-lg font-semibold">
          Recent activity
        </h2>
        <Link href="/admin/audit" className="text-brand text-sm hover:underline">
          Full audit log
        </Link>
      </div>
      {recentAudit.length === 0 ? (
        <Card className="p-6">
          <EmptyState title="No activity recorded yet" />
        </Card>
      ) : (
        <Card className="divide-subtle divide-y text-sm">
          {recentAudit.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-2 p-3">
              <code className="bg-surface-muted rounded px-1.5 py-0.5 font-mono text-xs">
                {entry.action}
              </code>
              <span className="text-muted min-w-0 flex-1 truncate">
                {entry.actorName ?? entry.actorEmail ?? "system"} &middot; {entry.entity}
              </span>
              <time className="text-muted text-xs" dateTime={entry.createdAt.toISOString()}>
                {formatDateTime(entry.createdAt)}
              </time>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
