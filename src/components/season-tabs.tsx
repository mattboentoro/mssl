import Link from "next/link";

interface SeasonTab {
  id: string;
  name: string;
  slug: string;
}

export function SeasonTabs({
  seasons,
  currentSeasonId,
  basePath,
  className = "",
}: {
  seasons: SeasonTab[];
  currentSeasonId: string;
  basePath: string;
  className?: string;
}) {
  if (seasons.length <= 1) return null;

  return (
    <nav aria-label="Season" className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {seasons.map((season) => {
        const current = season.id === currentSeasonId;
        return (
          <Link
            key={season.id}
            href={`${basePath}?season=${encodeURIComponent(season.slug)}`}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "bg-brand text-brand-contrast rounded-full px-3 py-1.5 text-sm font-medium"
                : "border-subtle hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm"
            }
          >
            {season.name}
          </Link>
        );
      })}
    </nav>
  );
}
