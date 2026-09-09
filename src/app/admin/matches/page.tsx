import Link from "next/link";

import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { MatchKitPicker } from "@/components/match-kit-picker";
import { KitSwatch } from "@/components/team-crest";
import { Card, EmptyState, Field, MatchStatusBadge, inputClass } from "@/components/ui";
import { createMatchAction } from "@/app/admin/actions";
import { formatDateTime, toDateTimeInputValue } from "@/lib/dates";
import { MATCH_STATUSES, MATCH_STATUS_LABELS } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Params {
  status?: string;
  division?: string;
  q?: string;
  season?: string;
}

export default async function AdminMatchesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const seasons = await prisma.season.findMany({ orderBy: { startsOn: "desc" } });
  const active = await getActiveSeason();
  const seasonId = params.season ?? active?.id ?? seasons[0]?.id;

  if (!seasonId) {
    return <EmptyState title="Create a season first" hint="Head to League setup." />;
  }

  const where: Record<string, unknown> = { seasonId };
  if (params.status) where.status = params.status;
  if (params.division) where.divisionId = params.division;
  if (params.q) {
    where.OR = [
      { homeTeam: { name: { contains: params.q } } },
      { awayTeam: { name: { contains: params.q } } },
    ];
  }

  const [divisions, teams, venues, matches] = await Promise.all([
    prisma.division.findMany({ where: { seasonId }, orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({ where: { division: { seasonId } }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
    prisma.match.findMany({
      where,
      orderBy: [{ kickoffAt: "asc" }],
      take: 200,
      include: {
        homeTeam: { select: { name: true, colorPrimary: true, colorAlternate: true } },
        awayTeam: { select: { name: true, colorPrimary: true, colorAlternate: true } },
        division: { select: { name: true } },
        venue: { select: { name: true } },
        referee: { select: { name: true } },
        report: { select: { homeScore: true, awayScore: true, status: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="filters">
        <h2 id="filters" className="sr-only">
          Filters
        </h2>
        <Card className="p-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Season" htmlFor="season">
              <select id="season" name="season" defaultValue={seasonId} className={inputClass}>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Division" htmlFor="division">
              <select
                id="division"
                name="division"
                defaultValue={params.division ?? ""}
                className={inputClass}
              >
                <option value="">All</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                defaultValue={params.status ?? ""}
                className={inputClass}
              >
                <option value="">All</option>
                {MATCH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MATCH_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team contains" htmlFor="q">
              <input id="q" name="q" defaultValue={params.q ?? ""} className={inputClass} />
            </Field>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-medium"
              >
                Apply
              </button>
              <Link href="/admin/matches" className="text-muted px-2 py-2 text-sm hover:underline">
                Reset
              </Link>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="fixture-list">
        <h2 id="fixture-list" className="mb-3 text-lg font-semibold">
          Fixtures ({matches.length})
        </h2>
        {matches.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No fixtures match those filters" />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-surface-muted text-muted text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Kick-off</th>
                  <th className="px-3 py-2 text-left">MW</th>
                  <th className="px-3 py-2 text-left">Fixture</th>
                  <th className="px-3 py-2 text-left">Division</th>
                  <th className="px-3 py-2 text-left">Referee</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-subtle divide-y">
                {matches.map((match) => (
                  <tr key={match.id}>
                    <td className="text-muted px-3 py-2 whitespace-nowrap">
                      {formatDateTime(match.kickoffAt)}
                    </td>
                    <td className="text-muted px-3 py-2">{match.matchweek}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <KitSwatch
                          team={match.homeTeam}
                          kit={match.homeKit}
                          teamName={match.homeTeam.name}
                        />
                        <span className="font-medium">{match.homeTeam.name}</span>
                      </span>
                      <span className="text-muted"> v </span>
                      <span className="inline-flex items-center gap-1.5">
                        <KitSwatch
                          team={match.awayTeam}
                          kit={match.awayKit}
                          teamName={match.awayTeam.name}
                        />
                        <span className="font-medium">{match.awayTeam.name}</span>
                      </span>
                      {match.venue ? (
                        <span className="text-muted block text-xs">{match.venue.name}</span>
                      ) : null}
                    </td>
                    <td className="text-muted px-3 py-2">{match.division.name}</td>
                    <td className="text-muted px-3 py-2">{match.referee?.name ?? "\u2014"}</td>
                    <td className="px-3 py-2">
                      <MatchStatusBadge status={match.status} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {match.report
                        ? `${match.report.homeScore}\u2013${match.report.awayScore}`
                        : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/matches/${match.id}`}
                        className="text-brand font-medium hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section aria-labelledby="new-fixture">
        <h2 id="new-fixture" className="mb-3 text-lg font-semibold">
          Add a fixture
        </h2>
        <Card className="p-5">
          <ActionForm action={createMatchAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="seasonId" value={seasonId} />
            <Field label="Division" htmlFor="new-division">
              <select id="new-division" name="divisionId" className={inputClass} required>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <FieldError name="divisionId" />
            </Field>
            <Field label="Matchweek" htmlFor="new-mw">
              <input
                id="new-mw"
                name="matchweek"
                type="number"
                min={1}
                max={60}
                defaultValue={1}
                className={inputClass}
                required
              />
              <FieldError name="matchweek" />
            </Field>
            <MatchKitPicker
              teams={teams.map((t) => ({
                id: t.id,
                name: t.name,
                colorPrimary: t.colorPrimary,
                colorAlternate: t.colorAlternate,
              }))}
            />
            <Field label="Kick-off" htmlFor="new-kickoff">
              <input
                id="new-kickoff"
                name="kickoffAt"
                type="datetime-local"
                defaultValue={toDateTimeInputValue(new Date())}
                className={inputClass}
                required
              />
              <FieldError name="kickoffAt" />
            </Field>
            <Field label="Venue" htmlFor="new-venue">
              <select id="new-venue" name="venueId" className={inputClass}>
                <option value="">To be confirmed</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Create fixture</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}

export const metadata = { title: "Match Control" };
