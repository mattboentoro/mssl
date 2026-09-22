import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
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

  const contexts = user.teamContexts.filter((context) => context.role === "player");
  const [teams, seasons] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: contexts.map((context) => context.teamId) } },
      select: { id: true, name: true },
    }),
    prisma.season.findMany({
      where: { id: { in: contexts.map((context) => context.seasonId) } },
      select: { id: true, name: true, startsOn: true },
    }),
  ]);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const seasonDetails = new Map(seasons.map((season) => [season.id, season]));
  const memberships = contexts
    .map((context) => ({
      ...context,
      teamName: teamNames.get(context.teamId),
      season: seasonDetails.get(context.seasonId),
    }))
    .filter(
      (
        context,
      ): context is typeof context & {
        teamName: string;
        season: { id: string; name: string; startsOn: Date };
      } => Boolean(context.teamName && context.season),
    )
    .sort(
      (left, right) =>
        right.season.startsOn.getTime() - left.season.startsOn.getTime() ||
        left.teamName.localeCompare(right.teamName),
    );

  return (
    <div>
      <PageHeader
        eyebrow="Player"
        title="Your teams"
        description="Roster membership is scoped to one team in each season."
        actions={<ButtonLink href="/roster">Roster requests</ButtonLink>}
      />
      {memberships.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map((membership) => (
            <Card key={`${membership.seasonId}:${membership.teamId}`} className="p-5">
              <h2 className="font-semibold">{membership.teamName}</h2>
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
