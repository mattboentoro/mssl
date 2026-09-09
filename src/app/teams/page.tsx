import type { Metadata } from "next";
import Link from "next/link";

import { TeamCrest } from "@/components/team-crest";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getSeasons, getTeamsBySeason, resolveSeason } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Teams",
  description: "Every team in the Microsoft Soccer League, by division.",
};
export const dynamic = "force-dynamic";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const [seasons, season] = await Promise.all([getSeasons(), resolveSeason(seasonParam)]);

  if (!season) {
    return (
      <div>
        <PageHeader title="Teams" />
        <EmptyState title="No seasons yet" hint="Run npm run seed to load sample data." />
      </div>
    );
  }

  const teams = await getTeamsBySeason(season.id);
  const byDivision = new Map<string, typeof teams>();
  for (const team of teams) {
    const bucket = byDivision.get(team.division.name);
    if (bucket) bucket.push(team);
    else byDivision.set(team.division.name, [team]);
  }

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Teams"
        description="Rosters are maintained by team captains through Match Control."
      />

      {seasons.length > 1 ? (
        <nav aria-label="Season" className="mb-6 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/teams?season=${s.slug}`}
              aria-current={s.id === season.id ? "page" : undefined}
              className={
                s.id === season.id
                  ? "bg-brand text-brand-contrast rounded-full px-3 py-1.5 text-sm font-medium"
                  : "border-subtle hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm"
              }
            >
              {s.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {teams.length === 0 ? (
        <EmptyState title="No teams in this season yet" />
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
                    <Link href={`/teams/${team.id}`} className="block p-4">
                      <div className="flex items-center gap-3">
                        <TeamCrest team={team} label={team.shortName || team.name} size="lg" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{team.name}</p>
                          <p className="text-muted text-xs">
                            {team.captainName ? `Captain: ${team.captainName}` : team.shortName}
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
