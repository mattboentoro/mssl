import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

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
            return (
              <Card key={match.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-muted text-xs">{formatDateTime(match.kickoffAt)}</p>
                    <h2 className="font-semibold">
                      {match.homeTeam.name} v {match.awayTeam.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {match.resultProposal ? (
                      <Badge>
                        {labels[match.resultProposal.status] ?? match.resultProposal.status}
                      </Badge>
                    ) : null}
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
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
