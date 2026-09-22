import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { AuthzError, requireReferee } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getRefereeRatingAggregate } from "@/lib/referee-ratings";

export const metadata: Metadata = { title: "Your referee rating" };
export const dynamic = "force-dynamic";

export default async function RefereeRatingsPage() {
  let context;
  try {
    context = await requireReferee();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/referee/ratings");
      forbidden();
    }
    throw error;
  }

  const aggregate = await getRefereeRatingAggregate(prisma, context.referee.id);

  return (
    <div>
      <PageHeader
        eyebrow="Referee"
        title="Your rating"
        description="Team feedback is private. Only the combined average and number of ratings are shown here."
      />
      <Card className="max-w-md p-6 text-center">
        {aggregate.count === 0 ? (
          <>
            <p className="text-2xl font-bold">No ratings yet</p>
            <p className="text-muted mt-2 text-sm">
              Your average will appear after participating teams submit feedback.
            </p>
          </>
        ) : (
          <>
            <p className="text-brand text-5xl font-bold tabular-nums">
              {aggregate.average?.toFixed(2)}
              <span className="text-muted text-xl"> / 5</span>
            </p>
            <p className="text-muted mt-2 text-sm">
              Based on {aggregate.count} {aggregate.count === 1 ? "rating" : "ratings"}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
