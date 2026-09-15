import { listMatches, resolveSeason } from "@/lib/queries";
import { LEAGUE_TIME_ZONE } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 5545 wants CRLF, escaped separators and folded 75-octet lines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

const stamp = (date: Date): string => `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = await resolveSeason(url.searchParams.get("season") ?? undefined);

  if (!season) {
    return new Response("No season available", { status: 404 });
  }

  const division = url.searchParams.get("division");
  const team = url.searchParams.get("team");

  const where: Record<string, unknown> = {
    seasonId: season.id,
    status: { notIn: ["CANCELLED"] },
  };
  if (division) where.divisionId = division;
  if (team) where.OR = [{ homeTeamId: team }, { awayTeamId: team }];

  const matches = await listMatches(where);
  const now = new Date();

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Microsoft Soccer League//MSSL//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`MSSL ${season.name}`)}`,
    // Events are emitted as absolute UTC instants (the trailing Z), which every
    // calendar client renders in the subscriber's own zone. This hint just sets
    // the calendar's default display zone to the league's.
    `X-WR-TIMEZONE:${LEAGUE_TIME_ZONE}`,
  ];

  for (const match of matches) {
    const start = new Date(match.kickoffAt);
    const end = new Date(start.getTime() + 105 * 60 * 1000);
    const title = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
    const description = [
      `${match.division.name} · Matchweek ${match.matchweek}`,
      match.referee ? `Referee: ${match.referee.name}` : "Referee: not yet assigned",
      match.report
        ? `Result: ${match.report.homeScore}-${match.report.awayScore}`
        : `Status: ${match.status}`,
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${match.id}@mssl`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${escapeText(title)}`),
      fold(`DESCRIPTION:${escapeText(description)}`),
      fold(
        `LOCATION:${escapeText(
          match.venueName || "TBD",
        )}`,
      ),
      `STATUS:${match.status === "POSTPONED" ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="mssl-${season.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
