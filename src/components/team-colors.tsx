import { kitColorName, resolveKit, type TeamColors } from "@/lib/kits";
import { type KitChoice } from "@/lib/enums";

/**
 * A slim two-tone bar showing a team's registered kit colours.
 *
 * The league does not use crests or badges, so this is the only visual identity
 * a team carries. It is decorative; the team name always appears next to it as
 * real text.
 */
export function TeamColorBar({
  team,
  size = "md",
}: {
  team: TeamColors;
  size?: "sm" | "md" | "lg";
}) {
  const primary = resolveKit(team, "PRIMARY");
  const alternate = resolveKit(team, "ALTERNATE");
  const dimension = size === "sm" ? "h-4 w-1.5" : size === "lg" ? "h-9 w-2.5" : "h-6 w-2";

  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15 ${dimension}`}
      style={{
        background: `linear-gradient(180deg, ${primary} 0%, ${primary} 50%, ${alternate} 50%, ${alternate} 100%)`,
      }}
    />
  );
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
  const colorName = kitColorName(color);
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/20 dark:ring-white/25"
      style={{ backgroundColor: color }}
      title={`${teamName} wear ${colorName.toLowerCase()}`}
    >
      <span className="sr-only">
        {teamName} wear {kit === "ALTERNATE" ? "their alternate kit" : "their primary kit"} (
        {colorName.toLowerCase()})
      </span>
    </span>
  );
}
