import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound, redirect } from "next/navigation";

import { GameReportForm } from "@/components/game-report-form";
import { ActionButton } from "@/components/match-actions";
import { Alert, Badge, Card, MatchStatusBadge, PageHeader } from "@/components/ui";
import { KitSwatch } from "@/components/team-colors";
import { WarningBoard } from "@/components/warning-board";
import { AuthzError, requireReferee } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { CARD_LABELS, SUSPENSION_REASON_LABELS, type CardType } from "@/lib/enums";
import { kitColorName, resolveKit } from "@/lib/kits";
import { isForfeit } from "@/lib/match-status";
import { prisma } from "@/lib/prisma";
import { getSeasonSuspensions, getWarningBoard, scoreText } from "@/lib/queries";
import { suspensionsForMatch } from "@/lib/suspensions";

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
      referee: { select: { id: true, name: true } },
      homeTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
      awayTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
      report: {
        include: {
          referee: { select: { name: true } },
          discipline: {
            orderBy: [{ minute: "asc" }],
            include: { team: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!match) notFound();

  const isOwner = match.refereeId === referee.id;
  const canAct = isOwner || user.isAdmin;
  const warnings = canAct
    ? await getWarningBoard(prisma, match.seasonId, [match.homeTeamId, match.awayTeamId])
    : [];
  // Which fixtures a ban covers is derived from the schedule, so ask for the
  // season's bans and pick out the ones that land on this fixture.
  const bans = canAct
    ? suspensionsForMatch(await getSeasonSuspensions(match.seasonId), match.id)
    : [];

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
            {match.venueName ? ` \u00b7 ${match.venueName}` : ""}
            <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <KitSwatch
                  team={match.homeTeam}
                  kit={match.homeKit}
                  teamName={match.homeTeam.name}
                />
                {match.homeTeam.name} in {kitColorName(resolveKit(match.homeTeam, match.homeKit))}
              </span>
              <span className="flex items-center gap-1.5">
                <KitSwatch
                  team={match.awayTeam}
                  kit={match.awayKit}
                  teamName={match.awayTeam.name}
                />
                {match.awayTeam.name} in {kitColorName(resolveKit(match.awayTeam, match.awayKit))}
              </span>
            </span>
          </>
        }
        actions={<MatchStatusBadge match={match} />}
      />

      {!canAct ? (
        <Alert title={match.referee ? "This is not your match" : "Nobody has claimed this match"}>
          {match.referee ? (
            <>
              {match.referee.name} is the assigned referee.{" "}
              <Link href="/referee" className="underline">
                Back to the available list
              </Link>
              .
            </>
          ) : (
            <>
              <span className="block">
                Review the details above, then claim it to file the report.
              </span>
              <span className="mt-3 block">
                <ActionButton
                  url={`/api/matches/${match.id}/assign`}
                  body={{ expectedVersion: match.version }}
                  label="Claim this match"
                  pendingLabel={"Claiming\u2026"}
                />
              </span>
            </>
          )}
        </Alert>
      ) : null}

      {/* ------------------------------ Workflow ----------------------------- */}
      {canAct ? (
        <Card className="p-5">
          <h2 className="font-semibold">Match-day steps</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <StepMarker done={Boolean(match.refereeId)} n={1} />
              <div className="flex-1">
                <p className="font-medium">Claimed</p>
                <p className="text-muted text-xs">
                  {match.referee
                    ? `${match.referee.name} has the match${
                        match.assignedAt ? `, claimed ${formatDateTime(match.assignedAt)}` : ""
                      }. Nobody else can take it.`
                    : "Not yet claimed."}
                </p>
                {isOwner && !match.report && match.status === "ASSIGNED" ? (
                  <div className="mt-2">
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
              <StepMarker done={Boolean(match.report)} n={2} />
              <div>
                <p className="font-medium">Game report filed</p>
                <p className="text-muted text-xs">
                  {match.report
                    ? `Submitted ${
                        match.report.submittedAt ? formatDateTime(match.report.submittedAt) : ""
                      }. Standings update immediately.`
                    : "Enter the final score and any cards once the match is played."}
                </p>
              </div>
            </li>
          </ol>
        </Card>
      ) : null}

      {/* --------------------------- Suspensions ----------------------------- */}
      {canAct && bans.length > 0 ? (
        <section aria-labelledby="suspended-players" className="mt-8">
          <h2 id="suspended-players" className="mb-1 text-lg font-semibold">
            Suspended for this fixture
          </h2>
          <p className="text-muted mb-3 text-sm">
            These players are serving a ban and must not take the field. Report anyone who plays
            anyway in your incident notes.
          </p>
          <Card className="divide-subtle divide-y">
            {bans.map((ban) => (
              <div key={ban.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span aria-hidden className="bg-danger h-6 w-4 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {ban.playerName}
                    <span className="text-muted font-normal"> &middot; {ban.teamName}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {SUSPENSION_REASON_LABELS[ban.reason] ?? ban.reason}
                    {` \u00b7 game ${ban.matchIds.indexOf(match.id) + 1} of ${ban.games}`}
                  </p>
                </div>
                <Badge tone="danger">Suspended</Badge>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* --------------------------- Warning board --------------------------- */}
      {canAct ? (
        <section aria-labelledby="warning-board" className="mt-8">
          <h2 id="warning-board" className="mb-1 text-lg font-semibold">
            Warning board
          </h2>
          <p className="text-muted mb-3 text-sm">
            Players from either side carrying a card this season. Anyone serving a suspension is
            listed first and may not take the field. League sanctions issued by the Game
            Administrator appear at the top.
          </p>
          <WarningBoard
            entries={warnings}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
            bans={bans}
          />
        </section>
      ) : null}

      {/* ------------------------------- Report ------------------------------ */}
      {match.report ? (
        <section aria-labelledby="filed-report" className="mt-8">
          <h2 id="filed-report" className="mb-3 text-lg font-semibold">
            Filed game report
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

            {match.report.discipline.length > 0 ? (
              <ul className="divide-subtle mt-4 divide-y text-sm">
                {match.report.discipline.map((card) => (
                  <li key={card.id} className="flex items-center gap-3 py-2">
                    <span className="text-muted w-10 shrink-0 text-right font-mono text-xs">
                      {card.minute === null ? "\u2014" : `${card.minute}\u2019`}
                    </span>
                    <span className="w-24 shrink-0 text-xs font-semibold">
                      {CARD_LABELS[card.type as CardType] ?? card.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {card.playerName}
                      <span className="text-muted"> ({card.team.name})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-4 text-sm">No cards shown.</p>
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
      ) : canAct && match.status === "ASSIGNED" ? (
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
          <Alert tone="info" title="Claim the match to open the report form">
            Claiming a fixture assigns it to you and locks out every other referee. The report form
            opens as soon as it is yours.
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
