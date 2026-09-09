"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/cn";

export interface NavLink {
  href: string;
  label: string;
}

export interface HeaderUser {
  name: string | null;
  email: string | null;
  isReferee: boolean;
  isAdmin: boolean;
  isDevBypass: boolean;
}

const PUBLIC_LINKS: NavLink[] = [
  { href: "/schedule", label: "Schedule" },
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/players/stats", label: "Stats" },
  { href: "/rules", label: "Rules" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu when the route changes. Adjusting state during render
  // (rather than in an effect) avoids a cascading re-render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const links = [...PUBLIC_LINKS];
  if (user?.isReferee || user?.isAdmin) links.push({ href: "/referee", label: "Referee" });
  if (user?.isAdmin) links.push({ href: "/admin/matches", label: "Admin" });

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="bg-surface/90 border-subtle sticky top-0 z-40 border-b backdrop-blur">
      <a
        href="#main"
        className="bg-brand text-brand-contrast sr-only rounded px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span aria-hidden className="text-xl">
            &#9917;
          </span>
          <span>
            MSSL
            <span className="text-muted ml-2 hidden text-xs font-medium sm:inline">
              Microsoft Soccer League
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(link.href)
                  ? "bg-brand/10 text-brand"
                  : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-2">
          <ThemeToggle />
          <AccountChip user={user} />
          <button
            type="button"
            className="border-subtle hover:bg-surface-muted inline-flex h-9 w-9 items-center justify-center rounded-lg border lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden>{open ? "\u2715" : "\u2630"}</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="border-subtle border-t lg:hidden"
        >
          <ul className="mx-auto grid max-w-6xl gap-1 px-4 py-3">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm font-medium",
                    isActive(link.href) ? "bg-brand/10 text-brand" : "hover:bg-surface-muted",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function AccountChip({ user }: { user: HeaderUser | null }) {
  if (!user) {
    return (
      <Link
        href="/signin"
        className="bg-brand text-brand-contrast rounded-lg px-3 py-2 text-sm font-semibold"
      >
        Sign in
      </Link>
    );
  }

  const initials = (user.name ?? user.email ?? "?")
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const role = user.isAdmin ? "Admin" : user.isReferee ? "Referee" : "Viewer";

  return (
    <Link
      href="/account"
      className="border-subtle hover:bg-surface-muted flex items-center gap-2 rounded-lg border py-1 pr-3 pl-1"
      title={`${user.name ?? user.email ?? "Account"} — ${role}`}
    >
      <span
        aria-hidden
        className="bg-brand text-brand-contrast flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
      >
        {initials || "?"}
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-xs font-semibold">{role}</span>
        {user.isDevBypass ? (
          <span className="text-warning block text-[10px] font-semibold">DEV</span>
        ) : null}
      </span>
    </Link>
  );
}
