import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { RefereeRatingForm } from "@/components/referee-rating-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listRateableMatchesForCaptain } from "@/lib/referee-ratings";

export const metadata: Metadata = { title: "Rate referees" };
export const dynamic = "force-dynamic";

export default async function CaptainRatingsPage() {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/captain/ratings");
      forbidden();
    }
    throw error;
  }

  const matches = await listRateableMatchesForCaptain(prisma, user.appUserId);

  return (
    <div>
      <PageHeader
        backHref="/captain"
        backLabel="Captain dashboard"
        eyebrow="Captain"
        title="Rate referees"
        description="Each participating team may keep one private rating after the assigned referee files the official result. Any current co-Captain can update it."
      />
      {matches.length === 0 ? (
        <EmptyState
          title="No matches are ready for a rating"
          hint="Matches appear here after an assigned referee files the official result."
        />
      ) : (
        <div className="space-y-5">
          {matches.map((match) => (
            <Card key={`${match.id}-${match.teamId}`} className="p-5">
              <p className="text-muted text-xs">
                {formatDateTime(match.kickoffAt)} &middot; Rating as {match.teamName}
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {match.homeTeam.name} v {match.awayTeam.name}
              </h2>
              <p className="text-muted mt-1 text-sm">Referee: {match.referee.name}</p>
              <RefereeRatingForm
                matchId={match.id}
                teamId={match.teamId}
                existingRating={match.existing?.rating}
                existingComment={match.existing?.comment}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
