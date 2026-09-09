import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MatchList } from "@/components/match-display";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CARD_LABELS, type CardType } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { resolveKit } from "@/lib/kits";
import {
  getDisciplinaryRecords,
  getStandingsForSeason,
  getTeamDetail,
  getTeamMatches,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeamDetail(id);
  return { title: team ? team.name : "Team not found" };
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getTeamDetail(id);
  if (!team) notFound();

  const [matches, standings, discipline] = await Promise.all([
    getTeamMatches(team.id),
    getStandingsForSeason(team.division.seasonId),
    getDisciplinaryRecords(team.division.seasonId),
  ]);

  const row = standings
    .find((d) => d.divisionId === team.division.id)
    ?.rows.find((r) => r.teamId === team.id);

  const played = matches.filter((m) => m.report);
  const upcoming = matches.filter((m) => !m.report && m.status !== "CANCELLED");
  const teamCards = discipline.filter((d) => d.teamId === team.id);

  const summary: { label: string; value: string }[] = row
    ? [
        { label: "Position", value: `#${row.rank}` },
        { label: "Played", value: String(row.played) },
        { label: "Record", value: `${row.won}W ${row.drawn}D ${row.lost}L` },
        { label: "Goals", value: `${row.goalsFor} : ${row.goalsAgainst}` },
        {
          label: "Goal difference",
          value: row.goalDifference > 0 ? `+${row.goalDifference}` : String(row.goalDifference),
        },
        { label: "Points", value: String(row.points) },
      ]
    : [];

  return (
    <div>
      <PageHeader
        eyebrow={team.division.name}
        title={team.name}
        description={
          <>
            {team.shortName ? `Also known as ${team.shortName}. ` : ""}
            {team.captainName ? `Captain: ${team.captainName}.` : "No captain on record."}
          </>
        }
      />

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <dl className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-5 w-5 rounded ring-1 ring-black/20 dark:ring-white/25"
              style={{ backgroundColor: resolveKit(team, "PRIMARY") }}
            />
            <div>
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                Primary kit
              </dt>
              <dd className="font-mono text-xs">{resolveKit(team, "PRIMARY")}</dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-5 w-5 rounded ring-1 ring-black/20 dark:ring-white/25"
              style={{ backgroundColor: resolveKit(team, "ALTERNATE") }}
            />
            <div>
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                Alternate kit
              </dt>
              <dd className="font-mono text-xs">{resolveKit(team, "ALTERNATE")}</dd>
            </div>
          </div>
        </dl>
      </div>

      {summary.length > 0 ? (
        <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {summary.map((item) => (
            <Card key={item.label} className="p-3">
              <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
                {item.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold">{item.value}</dd>
            </Card>
          ))}
        </dl>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section aria-labelledby="team-results">
            <h2 id="team-results" className="mb-3 text-lg font-semibold">
              Results
            </h2>
            {played.length === 0 ? (
              <EmptyState title="No results yet" />
            ) : (
              <MatchList matches={[...played].reverse()} />
            )}
          </section>

          <section aria-labelledby="team-fixtures">
            <h2 id="team-fixtures" className="mb-3 text-lg font-semibold">
              Upcoming fixtures
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState title="No fixtures scheduled" />
            ) : (
              <MatchList matches={upcoming} />
            )}
          </section>
        </div>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Disciplinary record</h2>
          {row ? (
            <Card className="mb-3 flex gap-4 p-4 text-sm">
              <span>
                <span className="text-lg font-semibold">{row.yellowCards}</span>{" "}
                <span className="text-muted text-xs">yellow</span>
              </span>
              <span>
                <span className="text-lg font-semibold">{row.redCards}</span>{" "}
                <span className="text-muted text-xs">red</span>
              </span>
            </Card>
          ) : null}
          {teamCards.length === 0 ? (
            <EmptyState title="No cards recorded" />
          ) : (
            <Card className="divide-subtle divide-y">
              {teamCards.slice(0, 20).map((card) => (
                <div key={card.id} className="flex items-center gap-3 p-3">
                  <span
                    aria-hidden
                    className={
                      card.type === "RED"
                        ? "bg-danger h-5 w-3.5 shrink-0 rounded-sm"
                        : "h-5 w-3.5 shrink-0 rounded-sm bg-yellow-400"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{card.playerName}</p>
                    <p className="text-muted text-xs">
                      {CARD_LABELS[card.type as CardType] ?? card.type}
                      {card.matchLabel ? ` \u00b7 ${card.matchLabel}` : ""}
                    </p>
                  </div>
                  <span className="text-muted shrink-0 text-xs">{formatDate(card.createdAt)}</span>
                </div>
              ))}
            </Card>
          )}
          <p className="text-muted mt-4 text-xs">
            Cards come from referee game reports and league sanctions. They feed the final standings
            tiebreaker.
          </p>
        </aside>
      </div>
    </div>
  );
}
