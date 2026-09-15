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

/**
 * The kit colours for one fixture, written out as visible text.
 *
 * A swatch alone is not enough on a phone at the pitch: colours are small,
 * screens are washed out in sunlight, and two dark kits look identical. Naming
 * the colour means a referee can confirm the clash call without squinting.
 */
export function KitLine({
  homeTeam,
  homeKit,
  awayTeam,
  awayKit,
  className = "",
}: {
  homeTeam: TeamColors & { name: string };
  homeKit: KitChoice | string;
  awayTeam: TeamColors & { name: string };
  awayKit: KitChoice | string;
  className?: string;
}) {
  const sides = [
    { team: homeTeam, kit: homeKit },
    { team: awayTeam, kit: awayKit },
  ];

  return (
    <p className={`text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}>
      {sides.map(({ team, kit }) => (
        <span key={team.name} className="inline-flex items-center gap-1.5">
          <KitSwatch team={team} kit={kit} teamName={team.name} />
          {/* One interpolation, so the phrase survives as a single text node. */}
          <span>{`${team.name} in ${kitColorName(resolveKit(team, kit)).toLowerCase()}`}</span>
        </span>
      ))}
    </p>
  );
}
