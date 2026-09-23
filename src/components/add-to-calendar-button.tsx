import { buttonClass } from "@/components/ui";

export function AddToCalendarButton({ matchId }: { matchId: string }) {
  return (
    <a
      href={`/matches/${encodeURIComponent(matchId)}/calendar.ics`}
      className={buttonClass("outline")}
    >
      Add to calendar
    </a>
  );
}
