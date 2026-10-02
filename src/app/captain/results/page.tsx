import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

import { MatchHeadToHead, MatchKitColors, MatchScore } from "@/components/match-display";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { listCaptainResultMatches } from "@/lib/captain-results";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Captain results" };
export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  PENDING_OPPONENT: "Opponent review",
  PENDING_ADMIN: "League review",
  REJECTED_OPPONENT: "Rejected by opponent",
  APPROVED: "Approved",
  REJECTED_ADMIN: "Rejected by league",
};

export default async function CaptainResultsPage() {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/captain/results");
      forbidden();
    }
    throw error;
  }
  const matches = await listCaptainResultMatches(prisma, user.appUserId);
  return (
    <div>
      <PageHeader
        backHref="/captain"
        backLabel="Captain dashboard"
        eyebrow="Captain"
        title="Match results"
        description="For matches without a referee, submit a score after kickoff and track approval by the opposing Captain and league."
      />
      {!matches.length ? (
        <EmptyState title="No played fixtures" />
      ) : (
        <div className="space-y-3">
          {matches.map((match) => {
            const eligible = !match.refereeId && !match.report && match.status === "SCHEDULED";
            const score = match.report
              ? { home: match.report.homeScore, away: match.report.awayScore }
              : match.resultProposal
                ? {
                    home: match.resultProposal.homeScore,
                    away: match.resultProposal.awayScore,
                  }
                : null;
            return (
              <Card key={match.id} className="p-4">
                <MatchHeadToHead
                  home={{ name: match.homeTeam.name }}
                  away={{ name: match.awayTeam.name }}
                  center={
                    score ? (
                      <MatchScore home={score.home} away={score.away} />
                    ) : (
                      <MatchKitColors
                        homeTeam={match.homeTeam}
                        awayTeam={match.awayTeam}
                        homeKit={match.homeKit}
                        awayKit={match.awayKit}
                      />
                    )
                  }
                  topLeft={match.division.name}
                  topRight={`MW ${match.matchweek}`}
                  time={formatDateTime(match.kickoffAt)}
                  status={
                    match.resultProposal ? (
                      <Badge>
                        {labels[match.resultProposal.status] ?? match.resultProposal.status}
                      </Badge>
                    ) : match.report ? (
                      <Badge tone="success">Official</Badge>
                    ) : null
                  }
                  location={<>&#128205; {match.venueName ?? "TBD"}</>}
                />
                <div className="mt-3 text-center">
                  {eligible ? (
                    <Link
                      className="text-accent text-sm font-semibold hover:underline"
                      href={`/captain/results/${match.id}`}
                    >
                      {match.resultProposal ? "View proposal" : "Enter result"} &rarr;
                    </Link>
                  ) : (
                    <span className="text-muted text-xs">
                      {match.report
                        ? "Official result filed"
                        : match.refereeId
                          ? "Referee assigned"
                          : "Unavailable"}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
