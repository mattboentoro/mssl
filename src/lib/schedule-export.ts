import { toCsvRow } from "@/lib/csv";
import { formatTime, toDateInputValue } from "@/lib/dates";
import { MATCH_DISPLAY_LABELS, matchDisplayStatus } from "@/lib/match-status";

export const ADMIN_MATCH_CSV_HEADER = [
  "matchweek",
  "kickoff",
  "division",
  "home",
  "away",
  "venue",
  "referee",
  "status",
];

interface ScheduleExportMatch {
  matchweek: string;
  kickoffAt: Date;
  venueName: string | null;
  status: string;
  refereeId: string | null;
  division: { name: string };
  homeTeam: { name: string };
  awayTeam: { name: string };
  referee: { name: string } | null;
  report: { homeForfeit: boolean; awayForfeit: boolean } | null;
}

export function buildAdminMatchCsv(matches: ScheduleExportMatch[], now: Date = new Date()): string {
  const lines = [toCsvRow(ADMIN_MATCH_CSV_HEADER)];
  for (const match of matches) {
    const status = MATCH_DISPLAY_LABELS[matchDisplayStatus(match, now)];
    lines.push(
      toCsvRow([
        String(match.matchweek),
        `${toDateInputValue(match.kickoffAt)} ${formatTime(match.kickoffAt)}`,
        match.division.name,
        match.homeTeam.name,
        match.awayTeam.name,
        match.venueName ?? "",
        match.referee?.name ?? "",
        status,
      ]),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
