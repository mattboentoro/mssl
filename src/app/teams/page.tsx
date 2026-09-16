import type { Metadata } from "next";
import Link from "next/link";

import { TeamColorBar } from "@/components/team-colors";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getTeams } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Teams",
  description: "Every team in the Microsoft Soccer League, by division.",
};
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  // Clubs belong to a division, not to a season, so this list is the league as
  // it stands today rather than a snapshot of one competition year.
  const teams = await getTeams();
  const byDivision = new Map<string, typeof teams>();
  for (const team of teams) {
    const bucket = byDivision.get(team.division.name);
    if (bucket) bucket.push(team);
    else byDivision.set(team.division.name, [team]);
  }

  return (
    <div>
      <PageHeader
        title="Teams"
        description="Every club in the league, by division. Rosters are maintained through Match Control."
      />

      {teams.length === 0 ? (
        <EmptyState title="No teams yet" hint="Add teams in Match Control, or run npm run seed." />
      ) : (
        <div className="space-y-8">
          {[...byDivision.entries()].map(([divisionName, divisionTeams]) => (
            <section
              key={divisionName}
              aria-labelledby={`teams-${divisionName.replace(/\s/g, "-")}`}
            >
              <h2
                id={`teams-${divisionName.replace(/\s/g, "-")}`}
                className="mb-3 text-lg font-semibold"
              >
                {divisionName}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {divisionTeams.map((team) => (
                  <Card key={team.id} as="li" className="hover:border-brand transition-colors">
                    <Link href={`/teams/${team.slug}`} className="block p-4">
                      <div className="flex items-center gap-3">
                        <TeamColorBar team={team} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{team.name}</p>
                          <p className="text-muted truncate text-xs">
                            {team.captains.length > 0
                              ? `${team.captains.length === 1 ? "Captain" : "Captains"}: ${team.captains
                                  .map((captain) => captain.name)
                                  .join(", ")}`
                              : team.shortName}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </Card>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
