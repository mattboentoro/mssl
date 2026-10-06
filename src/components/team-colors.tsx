import { kitColorName, resolveKit, type TeamColors } from "@/lib/kits";
import { KIT_LABELS, type KitChoice } from "@/lib/enums";

export function TeamKitLegend({ team }: { team: TeamColors }) {
  return (
    <dl className="flex flex-wrap gap-4 text-sm">
      {(["PRIMARY", "ALTERNATE"] as const).map((kit) => (
        <div key={kit} className="relative pl-7">
          <dt className="text-muted text-[10px] font-semibold tracking-wide uppercase">
            {KIT_LABELS[kit]}
          </dt>
          <dd className="text-xs">
            <span
              aria-hidden
              className="color-swatch absolute top-1/2 left-0 h-5 w-5 -translate-y-1/2 rounded"
              style={{ backgroundColor: resolveKit(team, kit) }}
            />
            {kitColorName(resolveKit(team, kit))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A slim two-tone bar showing a team's registered kit colours.
 *
 * Decorative identity alongside a team's visible name.
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
      data-black-kit={kitColorName(primary) === "Black" || kitColorName(alternate) === "Black"}
      className={`team-color-bar inline-block shrink-0 rounded-full ${dimension}`}
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
  decorative = false,
}: {
  team: TeamColors;
  kit: KitChoice | string;
  teamName: string;
  decorative?: boolean;
}) {
  const color = resolveKit(team, kit);
  const colorName = kitColorName(color);
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : `${kit === "ALTERNATE" ? "Alternate" : "Primary"} kit: ${colorName.toLowerCase()}`
      }
      className="inline-flex shrink-0 items-center gap-1"
      title={`${teamName} wear ${colorName.toLowerCase()}`}
    >
      <span
        aria-hidden
        className="color-swatch inline-block h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {!decorative ? (
        <span aria-hidden className="forced-colors-label text-xs">
          {colorName}
        </span>
      ) : null}
    </span>
  );
}
