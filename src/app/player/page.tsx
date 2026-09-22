import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requirePlayer } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Player dashboard" };
export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  let user;
  try {
    user = await requirePlayer();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/player");
      forbidden();
    }
    throw error;
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { userId: user.appUserId, status: "ACTIVE", endedAt: null },
    include: { team: true, season: true },
    orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
  });

  return (
    <div>
      <PageHeader
        eyebrow="Player"
        title="Your teams"
        description="Roster membership is scoped to one team in each season."
      />
      {memberships.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map((membership) => (
            <Card key={membership.id} className="p-5">
              <h2 className="font-semibold">{membership.team.name}</h2>
              <p className="text-muted mt-1 text-sm">{membership.season.name}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No active team membership"
            hint="You can still use the free-agent form while looking for a team."
          />
        </Card>
      )}
    </div>
  );
}
