import { readableTextOn, resolveKit, type TeamColors } from "@/lib/kits";
import { type KitChoice } from "@/lib/enums";

/**
 * A team's visual identity, built from its two registered kit colours.
 *
 * The league does not store crest artwork or an emoji, so the badge is a
 * two-tone disc — primary on the outside, alternate on the inside — with the
 * short name initials on top. It is decorative; the team name always appears
 * next to it as real text.
 */
export function TeamCrest({
  team,
  label,
  size = "md",
}: {
  team: TeamColors;
  /** Team or short name, used only to derive initials. */
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const primary = resolveKit(team, "PRIMARY");
  const alternate = resolveKit(team, "ALTERNATE");
  const dimension =
    size === "sm"
      ? "h-6 w-6 text-[9px]"
      : size === "lg"
        ? "h-11 w-11 text-sm"
        : "h-8 w-8 text-[11px]";

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-black/10 dark:ring-white/15 ${dimension}`}
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${alternate} 50%, ${alternate} 100%)`,
        color: readableTextOn(primary),
      }}
    >
      <span
        className="rounded-full px-1"
        style={{ backgroundColor: primary, color: readableTextOn(primary) }}
      >
        {initials(label)}
      </span>
    </span>
  );
}

function initials(label: string): string {
  const words = label
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * The colour a side is actually wearing for one fixture, shown next to the team
 * name so the referee (and spectators) can tell the two sides apart.
 */
export function KitSwatch({
  team,
  kit,
  teamName,
}: {
  team: TeamColors;
  kit: KitChoice | string;
  teamName: string;
}) {
  const color = resolveKit(team, kit);
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/20 dark:ring-white/25"
      style={{ backgroundColor: color }}
      title={`${teamName} wear ${color}`}
    >
      <span className="sr-only">
        {teamName} wear {kit === "ALTERNATE" ? "their alternate kit" : "their primary kit"}
      </span>
    </span>
  );
}
