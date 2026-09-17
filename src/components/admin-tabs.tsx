"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminTab {
  href: string;
  label: string;
}

/**
 * Admin section navigation with a visible "you are here" marker.
 *
 * A client component purely so it can read the current path; the links
 * themselves are ordinary `<Link>`s, so the nav still works without
 * JavaScript. `aria-current="page"` carries the same information to screen
 * readers that the filled pill carries visually.
 */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname() ?? "";

  // "/admin" must not light up for "/admin/matches", but "/admin/matches/abc"
  // should still light up "Matches".
  const activeHref = tabs.reduce<string | null>((best, tab) => {
    const matches = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
    if (!matches) return best;
    return best === null || tab.href.length > best.length ? tab.href : best;
  }, null);

  return (
    <nav aria-label="Admin sections" className="mt-4 flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const current = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "bg-brand text-brand-contrast rounded-full px-3 py-1.5 text-sm font-semibold"
                : "border-subtle hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm font-medium"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
