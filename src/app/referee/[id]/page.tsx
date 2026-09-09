import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";

import { GameReportForm } from "@/components/game-report-form";
import { ActionButton } from "@/components/match-actions";
import { Alert, Badge, Card, MatchStatusBadge, PageHeader } from "@/components/ui";
import { AuthzError, requireReferee } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { GAME_EVENT_LABELS, type GameEventType } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Match" };

export default async function RefereeMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let context;
  try {
    context = await requireReferee();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect(`/signin?callbackUrl=/referee/${id}`);
      forbidden();
    }
    throw error;
  }
  const { user, referee } = context;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      division: { select: { name: true } },
      venue: { select: { name: true, city: true } },
      referee: { select: { id: true, name: true } },
      homeTeam: {
        select: {
          id: true,
          name: true,
          players: {
            where: { active: true },
            orderBy: [{ jerseyNumber: "asc" }, { lastName: "asc" }],
            select: { id: true, firstName: true, lastName: true, jerseyNumber: true },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          players: {
            where: { active: true },
            orderBy: [{ jerseyNumber: "asc" }, { lastName: "asc" }],
            select: { id: true, firstName: true, lastName: true, jerseyNumber: true },
          },
        },
      },
      report: {
        include: {
          referee: { select: { name: true } },
          events: {
            orderBy: [{ minute: "asc" }],
            include: {
              player: { select: { firstName: true, lastName: true, jerseyNumber: true } },
              team: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!match) notFound();

  const isOwner = match.refereeId === referee.id;
  const canAct = isOwner || user.isAdmin;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4">
        <Link href="/referee" className="text-muted text-sm hover:underline">
          &larr; Referee Control
        </Link>
      </p>

      <PageHeader
        eyebrow={`${match.division.name} \u00b7 Matchweek ${match.matchweek}`}
        title={`${match.homeTeam.name} v ${match.awayTeam.name}`}
        description={
          <>
            {formatDateTime(match.kickoffAt)}
            {match.venue ? ` \u00b7 ${match.venue.name}, ${match.venue.city}` : ""}
          </>
        }
        actions={<MatchStatusBadge status={match.status} />}
      />

      {!canAct ? (
        <Alert title="This is not your match">
          {match.referee
            ? `${match.referee.name} is the assigned referee.`
            : "Nobody is assigned to it yet."}{" "}
          <Link href="/referee" className="underline">
            Back to the available list
          </Link>
          .
        </Alert>
      ) : null}

      {/* ------------------------------ Workflow ----------------------------- */}
      {canAct ? (
        <Card className="p-5">
          <h2 className="font-semibold">Match-day steps</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <StepMarker done={Boolean(match.refereeId)} n={1} />
              <div>
                <p className="font-medium">Assigned</p>
                <p className="text-muted text-xs">
                  {match.referee ? `${match.referee.name} is the referee.` : "Not yet assigned."}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <StepMarker done={Boolean(match.lockedAt)} n={2} />
              <div className="flex-1">
                <p className="font-medium">Locked</p>
                <p className="text-muted text-xs">
                  {match.lockedAt
                    ? `Locked ${formatDateTime(match.lockedAt)}${
                        match.lockedByName ? ` by ${match.lockedByName}` : ""
                      }.`
                    : "Locking freezes the fixture and rosters. Only an admin can undo it."}
                </p>
                {!match.lockedAt && match.status === "ASSIGNED" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionButton
                      url={`/api/matches/${match.id}/lock`}
                      body={{ expectedVersion: match.version }}
                      label="Lock match"
                      confirm="Lock this match? After locking, only an admin can reverse it."
                    />
                    <ActionButton
                      url={`/api/matches/${match.id}/unassign`}
                      label="Release match"
                      variant="ghost"
                      confirm="Release this match so another referee can claim it?"
                    />
                  </div>
                ) : null}
              </div>
            </li>
            <li className="flex items-start gap-3">
              <StepMarker done={Boolean(match.report)} n={3} />
              <div>
                <p className="font-medium">Game report filed</p>
                <p className="text-muted text-xs">
                  {match.report
                    ? `Submitted ${
                        match.report.submittedAt ? formatDateTime(match.report.submittedAt) : ""
                      }. Standings update immediately.`
                    : "Available once the match is locked."}
                </p>
              </div>
            </li>
          </ol>
        </Card>
      ) : null}

      {/* ------------------------------- Report ------------------------------ */}
      {match.report ? (
        <section aria-labelledby="filed-report" className="mt-8">
          <h2 id="filed-report" className="mb-3 text-lg font-semibold">
            Filed game report
          </h2>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-3xl font-bold tabular-nums">
                {match.report.homeScore} &ndash; {match.report.awayScore}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone={match.report.status === "CONFIRMED" ? "success" : "brand"}>
                  {match.report.status}
                </Badge>
                {match.report.homeForfeit ? (
                  <Badge tone="danger">{match.homeTeam.name} forfeit</Badge>
                ) : null}
                {match.report.awayForfeit ? (
                  <Badge tone="danger">{match.awayTeam.name} forfeit</Badge>
                ) : null}
              </div>
            </div>
            <p className="text-muted mt-1 text-xs">
              Filed by {match.report.referee?.name ?? "unknown"}
              {match.report.submittedAt ? ` on ${formatDateTime(match.report.submittedAt)}` : ""}.
              This report is read-only to referees.
            </p>

            {match.report.events.length > 0 ? (
              <ul className="divide-subtle mt-4 divide-y text-sm">
                {match.report.events.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 py-2">
                    <span className="text-muted w-10 shrink-0 text-right font-mono text-xs">
                      {event.minute}&rsquo;
                    </span>
                    <span className="w-28 shrink-0 text-xs font-semibold">
                      {GAME_EVENT_LABELS[event.type as GameEventType] ?? event.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {event.player
                        ? `${event.player.jerseyNumber ? `#${event.player.jerseyNumber} ` : ""}${event.player.firstName} ${event.player.lastName}`
                        : "Unattributed"}
                      <span className="text-muted"> ({event.team.name})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-4 text-sm">No events itemised.</p>
            )}

            {match.report.notes || match.report.incidentReport || match.report.misconduct ? (
              <div className="border-subtle mt-4 space-y-3 border-t pt-4 text-sm">
                {match.report.notes ? (
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap">{match.report.notes}</p>
                  </div>
                ) : null}
                {match.report.incidentReport ? (
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">Incident report</p>
                    <p className="mt-1 whitespace-pre-wrap">{match.report.incidentReport}</p>
                  </div>
                ) : null}
                {match.report.misconduct ? (
                  <div>
                    <p className="text-muted text-xs font-semibold uppercase">Misconduct</p>
                    <p className="mt-1 whitespace-pre-wrap">{match.report.misconduct}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </section>
      ) : canAct && match.status === "LOCKED" ? (
        <section aria-labelledby="file-report" className="mt-8">
          <h2 id="file-report" className="mb-3 text-lg font-semibold">
            File the game report
          </h2>
          <Card className="p-5">
            <GameReportForm
              matchId={match.id}
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
            />
          </Card>
        </section>
      ) : canAct ? (
        <div className="mt-8">
          <Alert tone="info" title="Lock the match to unlock the report form">
            Rosters are frozen at lock time, so the report form only opens once the match is locked.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}

function StepMarker({ done, n }: { done: boolean; n: number }) {
  return (
    <span
      aria-hidden
      className={
        done
          ? "bg-success inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          : "bg-surface-muted text-muted inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      }
    >
      {done ? "\u2713" : n}
    </span>
  );
}
