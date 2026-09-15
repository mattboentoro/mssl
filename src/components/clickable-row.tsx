"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that navigates on click.
 *
 * The row click is a mouse affordance only: every row also contains a real
 * `<Link>` on the fixture text, which is what keyboard and screen-reader users
 * follow and what works with JavaScript disabled. Clicks that land on another
 * interactive element (a nested link, a button, a form control) are left alone
 * so the row never swallows them.
 */
export function ClickableRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <tr
      className={`hover:bg-surface-muted cursor-pointer ${className}`.trim()}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, input, select, textarea, label")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
