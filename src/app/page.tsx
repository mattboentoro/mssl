import Link from "next/link";

import { MatchList, StandingsTable } from "@/components/match-display";
import { Badge, ButtonLink, Card, EmptyState, SectionHeading } from "@/components/ui";
import { formatLongDate } from "@/lib/dates";
import {
  getActiveSeason,
  getAnnouncements,
  getRecentResults,
  getStandingsForSeason,
  getUpcomingMatches,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  {
    href: "/schedule",
    label: "Full schedule",
    emoji: "\uD83D\uDCC5",
    hint: "Fixtures, results & ICS export",
  },
  {
    href: "/standings",
    label: "Standings",
    emoji: "\uD83C\uDFC6",
    hint: "Live tables per division",
  },
  { href: "/teams", label: "Teams", emoji: "\uD83D\uDC65", hint: "Rosters, results & stats" },
  {
    href: "/players/stats",
    label: "Player stats",
    emoji: "\u26BD",
    hint: "Top scorers & discipline",
  },
  { href: "/rules", label: "Rules", emoji: "\uD83D\uDCD8", hint: "Laws, conduct & forms" },
  {
    href: "/referee",
    label: "Referee control",
    emoji: "\uD83E\uDDE4",
    hint: "Claim matches & file reports",
  },
];

export default async function HomePage() {
  const season = await getActiveSeason();

  if (!season) {
    return (
      <EmptyState
        title="No season has been set up yet."
        hint={
          <>
            Run <code className="font-mono">npm run seed</code> to load sample data.
          </>
        }
      />
    );
  }

  const [announcements, upcoming, results, standings] = await Promise.all([
    getAnnouncements(4),
    getUpcomingMatches(season.id, 4),
    getRecentResults(season.id, 4),
    getStandingsForSeason(season.id),
  ]);

  const pinned = announcements.filter((a) => a.pinned);
  const rest = announcements.filter((a) => !a.pinned);
  const topDivision = standings.find((division) => division.rows.length > 0);

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="from-brand/15 border-subtle rounded-2xl border bg-gradient-to-br to-transparent p-6 sm:p-10">
        <Badge tone="brand">{season.name}</Badge>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Microsoft Soccer League
        </h1>
        <p className="text-muted mt-4 max-w-2xl text-base sm:text-lg">
          The employee-run soccer league for the Microsoft community. Every result on this site is
          computed from the official report the match referee files &mdash; no spreadsheets, no
          manual edits.
        </p>
        <p className="text-muted mt-2 text-sm">
          Season runs {formatLongDate(season.startsOn)} &ndash; {formatLongDate(season.endsOn)}.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/schedule">View the schedule</ButtonLink>
          <ButtonLink href="/standings" variant="secondary">
            Standings
          </ButtonLink>
          <ButtonLink href="/referee" variant="secondary">
            Referee sign-in
          </ButtonLink>
        </div>
      </section>

      {/* Announcements */}
      {announcements.length > 0 ? (
        <section>
          <SectionHeading title="Announcements" />
          <div className="grid gap-4 md:grid-cols-2">
            {pinned.map((item) => (
              <Card key={item.id} className="border-brand/40 p-5">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">Pinned</Badge>
                  <span className="text-muted text-xs">{formatLongDate(item.publishedAt)}</span>
                </div>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="text-muted mt-1 text-sm">{item.summary}</p>
              </Card>
            ))}
            {rest.map((item) => (
              <Card key={item.id} className="p-5">
                <span className="text-muted text-xs">{formatLongDate(item.publishedAt)}</span>
                <h3 className="mt-2 font-semibold">{item.title}</h3>
                <p className="text-muted mt-1 text-sm">{item.summary}</p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Fixtures + results */}
      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHeading title="Next fixtures" href="/schedule" />
          {upcoming.length > 0 ? (
            <MatchList matches={upcoming} />
          ) : (
            <EmptyState title="No upcoming fixtures scheduled." />
          )}
        </div>
        <div>
          <SectionHeading title="Latest results" href="/schedule?view=results" />
          {results.length > 0 ? (
            <MatchList matches={results} />
          ) : (
            <EmptyState
              title="No results filed yet."
              hint="Results appear once a referee submits a match report."
            />
          )}
        </div>
      </section>

      {/* Standings snippet */}
      {topDivision ? (
        <section>
          <SectionHeading title={`${topDivision.divisionName} snapshot`} href="/standings" />
          <StandingsTable
            rows={topDivision.rows.slice(0, 5)}
            caption={`Top of ${topDivision.divisionName}`}
            compact
          />
        </section>
      ) : null}

      {/* Quick links */}
      <section>
        <SectionHeading title="Quick links" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Card as="li" key={link.href} className="hover:border-brand/50 transition">
              <Link href={link.href} className="block p-4">
                <span aria-hidden className="text-xl">
                  {link.emoji}
                </span>
                <p className="mt-2 font-semibold">{link.label}</p>
                <p className="text-muted text-sm">{link.hint}</p>
              </Link>
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}
