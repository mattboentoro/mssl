import Link from "next/link";

import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const season = await getActiveSeason();

  const [pending, counts, recentAudit, unassigned] = await Promise.all([
    prisma.match.findMany({
      where: { status: "REPORT_SUBMITTED" },
      orderBy: { kickoffAt: "asc" },
      take: 12,
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        division: { select: { name: true } },
        referee: { select: { name: true } },
        report: { select: { homeScore: true, awayScore: true, submittedAt: true } },
      },
    }),
    Promise.all([
      prisma.season.count(),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.gameReport.count(),
      prisma.referee.count({ where: { active: true } }),
    ]),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.match.count({ where: { refereeId: null, status: "SCHEDULED" } }),
  ]);

  const [seasons, teams, players, matches, reports, referees] = counts;

  const stats = [
    { label: "Seasons", value: seasons },
    { label: "Teams", value: teams },
    { label: "Players", value: players },
    { label: "Fixtures", value: matches },
    { label: "Reports filed", value: reports },
    { label: "Active referees", value: referees },
  ];

  return (
    <div className="space-y-8">
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
            {pending.map((match) => (
              <Link
                key={match.id}
                href={`/admin/matches/${match.id}`}
                className="hover:bg-surface-muted flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {match.homeTeam.name} v {match.awayTeam.name}
                  </p>
                  <p className="text-muted text-xs">
                    {match.division.name} &middot; {formatDateTime(match.kickoffAt)} &middot; filed
                    by {match.referee?.name ?? "unknown"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-semibold">
                    {match.report?.homeScore}&ndash;{match.report?.awayScore}
                  </span>
                  <Badge tone="warning">Review</Badge>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>

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
    </div>
  );
}
