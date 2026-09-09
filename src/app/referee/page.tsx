import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

import { ActionButton } from "@/components/match-actions";
import { Alert, Card, EmptyState, PageHeader, inputClass, labelClass } from "@/components/ui";
import { MatchStatusBadge } from "@/components/ui";
import { AuthzError, requireReferee } from "@/lib/authz";
import { formatDateTime } from "@/lib/dates";
import { MATCH_STATUS_LABELS, type MatchStatus } from "@/lib/enums";
import { getActiveSeason, getDivisions, listMatches } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Referee Control" };
export const dynamic = "force-dynamic";

interface RefereeParams {
  from?: string;
  to?: string;
  division?: string;
  venue?: string;
}

export default async function RefereePage({
  searchParams,
}: {
  searchParams: Promise<RefereeParams>;
}) {
  let context;
  try {
    context = await requireReferee();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/referee");
      forbidden();
    }
    throw error;
  }

  const { user, referee } = context;
  const params = await searchParams;
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div>
        <PageHeader title="Referee Control" />
        <EmptyState title="No active season" hint="Ask an admin to create one in Match Control." />
      </div>
    );
  }

  const [divisions, venues] = await Promise.all([
    getDivisions(season.id),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // --- Available matches -----------------------------------------------------
  const availableWhere: Record<string, unknown> = {
    seasonId: season.id,
    refereeId: null,
    status: { in: ["SCHEDULED"] },
  };
  if (params.division) availableWhere.divisionId = params.division;
  if (params.venue) availableWhere.venueId = params.venue;

  const kickoff: Record<string, Date> = {};
  if (params.from) kickoff.gte = new Date(`${params.from}T00:00:00.000Z`);
  if (params.to) kickoff.lte = new Date(`${params.to}T23:59:59.999Z`);
  if (Object.keys(kickoff).length > 0) availableWhere.kickoffAt = kickoff;

  const [available, mine] = await Promise.all([
    listMatches(availableWhere, 50),
    listMatches({ refereeId: referee.id }),
  ]);

  const active = mine.filter((m) => m.status === "ASSIGNED");
  const history = mine.filter((m) => m.status !== "ASSIGNED");

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Referee Control"
        description={`Signed in as ${referee.name}. Claim an open fixture \u2014 that locks it to you \u2014 then file the game report.`}
      />

      {user.isDevBypass ? (
        <Alert tone="warning" title="Development session">
          Roles come from the dev bypass, not from the <code className="font-mono">msslrefs</code>{" "}
          distribution list.
        </Alert>
      ) : null}

      {/* ------------------------------ My matches --------------------------- */}
      <section aria-labelledby="my-active" className="mt-8">
        <h2 id="my-active" className="mb-3 text-lg font-semibold">
          Your current assignments
        </h2>
        {active.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="Nothing assigned to you right now"
              hint="Claim a match from the list below."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {active.map((match) => (
              <Card key={match.id} as="li" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <MatchStatusBadge status={match.status} />
                      <span className="text-muted text-xs">{match.division.name}</span>
                    </div>
                    <p className="mt-1 font-semibold">
                      {match.homeTeam.name} v {match.awayTeam.name}
                    </p>
                    <p className="text-muted text-sm">
                      {formatDateTime(match.kickoffAt)}
                      {match.venue ? ` \u00b7 ${match.venue.name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {match.status === "ASSIGNED" ? (
                      <ActionButton
                        url={`/api/matches/${match.id}/unassign`}
                        label="Release"
                        variant="ghost"
                        confirm="Release this match so another referee can claim it?"
                      />
                    ) : null}
                    <Link
                      href={`/referee/${match.id}`}
                      className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      {match.report ? "Open" : "File report"}
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------- Available matches ------------------------ */}
      <section aria-labelledby="available" className="mt-10">
        <h2 id="available" className="mb-3 text-lg font-semibold">
          Available matches
        </h2>

        <Card className="mb-4 p-4">
          <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={labelClass} htmlFor="from">
                From
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={params.from ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="to">
                To
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={params.to ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="division">
                Division
              </label>
              <select
                id="division"
                name="division"
                defaultValue={params.division ?? ""}
                className={inputClass}
              >
                <option value="">All divisions</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="venue">
                Venue
              </label>
              <select
                id="venue"
                name="venue"
                defaultValue={params.venue ?? ""}
                className={inputClass}
              >
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="bg-brand text-brand-contrast rounded-lg px-4 py-2 text-sm font-medium"
              >
                Filter
              </button>
              <Link href="/referee" className="text-muted px-2 py-2 text-sm hover:underline">
                Reset
              </Link>
            </div>
          </form>
        </Card>

        {available.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No unassigned matches match those filters"
              hint="Every fixture may already have a referee."
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {available.map((match) => (
              <Card key={match.id} as="li" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted text-xs">
                      {match.division.name} &middot; MW {match.matchweek}
                    </p>
                    <p className="mt-0.5 font-semibold">
                      {match.homeTeam.name} v {match.awayTeam.name}
                    </p>
                    <p className="text-muted text-sm">
                      {formatDateTime(match.kickoffAt)}
                      {match.venue ? ` \u00b7 ${match.venue.name}, ${match.venue.city}` : ""}
                    </p>
                  </div>
                  <ActionButton
                    url={`/api/matches/${match.id}/assign`}
                    body={{ expectedVersion: match.version }}
                    label="Assign me"
                    pendingLabel={"Claiming\u2026"}
                  />
                </div>
              </Card>
            ))}
          </ul>
        )}
        <p className="text-muted mt-3 text-xs">
          Assignment is race-safe: if another referee claims a match first you will get a clear
          &ldquo;already assigned&rdquo; message rather than a double booking.
        </p>
      </section>

      {/* ------------------------------- History ------------------------------ */}
      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="mb-3 text-lg font-semibold">
          Your history
        </h2>
        {history.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="No completed matches yet" />
          </Card>
        ) : (
          <Card className="divide-subtle divide-y">
            {history.map((match) => (
              <Link
                key={match.id}
                href={`/referee/${match.id}`}
                className="hover:bg-surface-muted flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {match.homeTeam.name} v {match.awayTeam.name}
                  </p>
                  <p className="text-muted text-xs">
                    {formatDateTime(match.kickoffAt)} &middot; {match.division.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {match.report ? (
                    <span className="font-mono text-sm font-semibold">
                      {match.report.homeScore}&ndash;{match.report.awayScore}
                    </span>
                  ) : null}
                  <span className="text-muted text-xs">
                    {MATCH_STATUS_LABELS[match.status as MatchStatus]}
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
