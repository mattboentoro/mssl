import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { AdminMatchForms } from "@/components/admin-match-forms";
import { ActionButton } from "@/components/match-actions";
import { KitSwatch } from "@/components/team-colors";
import { Alert, Badge, Card, MatchStatusBadge } from "@/components/ui";
import { deleteMatchAction } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/dates";
import { CARD_LABELS, type CardType, type KitChoice } from "@/lib/enums";
import { isForfeit } from "@/lib/match-status";
import { prisma } from "@/lib/prisma";
import { scoreText } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminMatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [match, referees, divisions, teams] = await Promise.all([
    prisma.match.findUnique({
      where: { id },
      include: {
        division: { select: { name: true } },
        referee: { select: { id: true, name: true, email: true } },
        homeTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
        awayTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
        report: {
          include: {
            referee: { select: { name: true } },
            discipline: {
              orderBy: { minute: "asc" },
              include: { team: { select: { name: true } } },
            },
          },
        },
      },
    }),
    prisma.referee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.division.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        divisionId: true,
        colorPrimary: true,
        colorAlternate: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!match) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { entityId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="space-y-8">
      <p>
        <Link href="/admin/matches" className="text-muted text-sm hover:underline">
          &larr; All fixtures
        </Link>
      </p>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted text-xs">
              {match.division.name} &middot; Matchweek {match.matchweek}
            </p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
              <KitSwatch team={match.homeTeam} kit={match.homeKit} teamName={match.homeTeam.name} />
              {match.homeTeam.name}
              <span className="text-muted font-normal">v</span>
              <KitSwatch team={match.awayTeam} kit={match.awayKit} teamName={match.awayTeam.name} />
              {match.awayTeam.name}
            </h2>
            <p className="text-muted mt-1 text-sm">
              {formatDateTime(match.kickoffAt)}
              {match.venueName ? ` \u00b7 ${match.venueName}` : ""}
            </p>
          </div>
          <MatchStatusBadge match={match} />
        </div>
      </Card>

      {match.report ? (
        <section aria-labelledby="report-review">
          <h2 id="report-review" className="mb-3 text-lg font-semibold">
            Game report
          </h2>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-3xl font-bold tabular-nums">{scoreText(match.report)}</p>
                {/*
                  A forfeit is filed against the played score, usually 0-0, so
                  show both rather than let the awarded figures look invented.
                */}
                {isForfeit(match.report) ? (
                  <p className="text-muted text-xs">
                    {`Awarded on forfeit \u00b7 filed ${match.report.homeScore}\u2013${match.report.awayScore}`}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={match.report.status === "CONFIRMED" ? "success" : "brand"}>
                  {match.report.status}
                </Badge>
                {match.report.homeForfeit ? <Badge tone="danger">Home forfeit</Badge> : null}
                {match.report.awayForfeit ? <Badge tone="danger">Away forfeit</Badge> : null}
              </div>
            </div>
            <p className="text-muted mt-1 text-xs">
              Filed by {match.report.referee?.name ?? "unknown"}
              {match.report.submittedAt ? ` on ${formatDateTime(match.report.submittedAt)}` : ""}
              {match.report.confirmedAt
                ? ` \u00b7 confirmed ${formatDateTime(match.report.confirmedAt)}`
                : ""}
            </p>

            {match.report.discipline.length > 0 ? (
              <ul className="divide-subtle mt-4 divide-y text-sm">
                {match.report.discipline.map((card) => (
                  <li key={card.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-muted w-10 text-right font-mono text-xs">
                      {card.minute === null ? "\u2014" : `${card.minute}\u2019`}
                    </span>
                    <span className="w-24 text-xs font-semibold">
                      {CARD_LABELS[card.type as CardType] ?? card.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {card.playerName}
                      <span className="text-muted"> ({card.team.name})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {match.report.notes ? (
              <div className="border-subtle mt-4 border-t pt-4 text-sm">
                <p className="text-muted text-xs font-semibold uppercase">Referee notes</p>
                <p className="mt-1 whitespace-pre-wrap">{match.report.notes}</p>
              </div>
            ) : null}
            {match.report.incidentReport ? (
              <div className="mt-3 text-sm">
                <p className="text-muted text-xs font-semibold uppercase">Incident report</p>
                <p className="mt-1 whitespace-pre-wrap">{match.report.incidentReport}</p>
              </div>
            ) : null}
            {match.report.misconduct ? (
              <div className="mt-3 text-sm">
                <p className="text-muted text-xs font-semibold uppercase">Misconduct</p>
                <p className="mt-1 whitespace-pre-wrap">{match.report.misconduct}</p>
              </div>
            ) : null}

            <div className="border-subtle mt-5 flex flex-wrap gap-2 border-t pt-4">
              <ActionButton
                url={`/api/matches/${match.id}/confirm`}
                label="Confirm result"
                variant="primary"
              />
              <ActionButton
                url={`/api/matches/${match.id}/dispute`}
                label="Dispute"
                variant="secondary"
                promptLabel="Reason for disputing this report"
                promptField="reason"
              />
              <ActionButton
                url={`/api/matches/${match.id}/reopen`}
                label="Reopen game"
                variant="danger"
                confirm={`This permanently removes the current score, report notes, and referee-issued cards. ${
                  match.refereeId
                    ? "The assigned referee will need to submit a new report."
                    : "The match will return to the open unassigned pool."
                }`}
                confirmTitle="Reopen this completed game?"
                confirmActionLabel="Reopen game"
                confirmCancelLabel="Keep completed"
                promptLabel="Reason for reopening this game"
                promptField="reason"
              />
            </div>
          </Card>
        </section>
      ) : (
        <Alert tone="info" title="No report filed yet">
          The assigned referee files the report once the match has been played. If they cannot,
          enter the result yourself below &mdash; it is recorded as the report and counted in the
          standings.
        </Alert>
      )}

      <AdminMatchForms
        matchId={match.id}
        status={match.status}
        kickoffAt={match.kickoffAt.toISOString()}
        venueName={match.venueName}
        matchweek={match.matchweek}
        countsForStandings={match.countsForStandings}
        refereeId={match.refereeId}
        hasReport={Boolean(match.report)}
        divisionId={match.divisionId}
        homeTeamId={match.homeTeamId}
        awayTeamId={match.awayTeamId}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
        teams={teams}
        homeKit={match.homeKit as KitChoice}
        awayKit={match.awayKit as KitChoice}
        currentHomeScore={match.report?.homeScore ?? 0}
        currentAwayScore={match.report?.awayScore ?? 0}
        currentHomeForfeit={match.report?.homeForfeit ?? false}
        currentAwayForfeit={match.report?.awayForfeit ?? false}
        referees={referees.map((r) => ({ id: r.id, name: r.name }))}
      />

      {/*
        Always shown, even when deletion is blocked: an admin looking for the
        control should find out why it is unavailable rather than wonder
        whether the feature exists at all.
      */}
      <section aria-labelledby="danger-zone">
        <h2 id="danger-zone" className="mb-3 text-lg font-semibold">
          Delete fixture
        </h2>
        <Card className="p-5">
          {match.report ? (
            <p className="text-muted text-sm">
              This fixture has a game report, so it cannot be deleted &mdash; results are never
              removed silently. Dispute or override the result above if it is wrong.
            </p>
          ) : (
            <ActionForm action={deleteMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <p className="text-muted mb-3 text-sm">
                Removes the fixture from the schedule for good. Only fixtures without a game report
                can be deleted.
              </p>
              <SubmitButton variant="danger" confirm="Delete this fixture permanently?">
                Delete fixture
              </SubmitButton>
            </ActionForm>
          )}
        </Card>
      </section>

      <section aria-labelledby="match-audit">
        <h2 id="match-audit" className="mb-3 text-lg font-semibold">
          Audit trail for this fixture
        </h2>
        <Card className="divide-subtle divide-y text-sm">
          {audit.length === 0 ? (
            <p className="text-muted p-4">Nothing recorded yet.</p>
          ) : (
            audit.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-2 p-3">
                <code className="bg-surface-muted rounded px-1.5 py-0.5 font-mono text-xs">
                  {entry.action}
                </code>
                <span className="text-muted min-w-0 flex-1 truncate">
                  {entry.actorName ?? entry.actorEmail ?? "system"}
                </span>
                <time className="text-muted text-xs">{formatDateTime(entry.createdAt)}</time>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
