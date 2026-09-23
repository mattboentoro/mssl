import { isForfeit } from "@/lib/match-status";
import { displayedScore } from "@/lib/queries";
import { LEAGUE_TIME_ZONE } from "@/lib/timezone";

export interface CalendarMatch {
  id: string;
  kickoffAt: Date;
  updatedAt: Date;
  version: number;
  status: string;
  matchweek: string;
  venueName: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  division: { name: string };
  referee: { name: string } | null;
  report: {
    homeScore: number;
    awayScore: number;
    homeForfeit: boolean;
    awayForfeit: boolean;
  } | null;
}

export const CALENDAR_MATCH_INCLUDE = {
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
  division: { select: { name: true } },
  referee: { select: { name: true } },
  report: {
    select: {
      homeScore: true,
      awayScore: true,
      homeForfeit: true,
      awayForfeit: true,
    },
  },
} as const;

export function escapeIcalText(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function foldIcalLine(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const folded: string[] = [];
  let chunk = "";
  let limit = 75;
  for (const character of line) {
    if (chunk && utf8Length(chunk + character) > limit) {
      folded.push(chunk);
      chunk = ` ${character}`;
      limit = 75;
    } else {
      chunk += character;
    }
  }
  if (chunk) folded.push(chunk);
  return folded.join("\r\n");
}

export const icalTimestamp = (date: Date): string =>
  `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

function eventStatus(status: string): "CANCELLED" | "TENTATIVE" | "CONFIRMED" {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "POSTPONED") return "TENTATIVE";
  return "CONFIRMED";
}

export function serializeCalendar(input: {
  name: string;
  matches: CalendarMatch[];
  prodId?: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${input.prodId ?? "-//Microsoft Soccer League//MSSL//EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(input.name)}`,
    `X-WR-TIMEZONE:${LEAGUE_TIME_ZONE}`,
  ];

  for (const match of input.matches) {
    const start = new Date(match.kickoffAt);
    const end = new Date(start.getTime() + 105 * 60 * 1000);
    const score = displayedScore(match.report);
    const description = [
      `${match.division.name} - Matchweek ${match.matchweek}`,
      match.referee ? `Referee: ${match.referee.name}` : "Referee: not yet assigned",
      score
        ? `Result: ${score.home}-${score.away}${isForfeit(match.report) ? " (awarded on forfeit)" : ""}`
        : `Status: ${match.status}`,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${match.id}@mssl`,
      `SEQUENCE:${Math.max(0, match.version)}`,
      `DTSTAMP:${icalTimestamp(match.updatedAt)}`,
      `LAST-MODIFIED:${icalTimestamp(match.updatedAt)}`,
      `DTSTART:${icalTimestamp(start)}`,
      `DTEND:${icalTimestamp(end)}`,
      `SUMMARY:${escapeIcalText(`${match.homeTeam.name} vs ${match.awayTeam.name}`)}`,
      `DESCRIPTION:${escapeIcalText(description)}`,
      `LOCATION:${escapeIcalText(match.venueName || "TBD")}`,
      `STATUS:${eventStatus(match.status)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcalLine).join("\r\n")}\r\n`;
}

export function calendarResponse(
  body: string,
  filename: string,
  cacheControl = "public, max-age=300",
): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
      "Cache-Control": cacheControl,
    },
  });
}
