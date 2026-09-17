"use client";

import { Menu, X } from "lucide-react";
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
  { href: "/", label: "Overview" },
  { href: "/schedule", label: "Schedule" },
  { href: "/standings", label: "Standings" },
  { href: "/teams", label: "Teams" },
  { href: "/rules", label: "Rules" },
  { href: "/faq", label: "FAQ" },
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
    <header className="bg-surface relative z-40">
      <a
        href="#main"
        className="bg-brand text-brand-contrast sr-only rounded px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="bg-brand text-brand-contrast">
        <div className="site-width flex flex-wrap justify-between gap-x-6 gap-y-1 py-2 text-xs">
          <span>Microsoft Soccer League</span>
          <span>Employee-run. Community-led.</span>
        </div>
      </div>
      <div className="site-width flex items-center gap-4 py-5 sm:py-6">
        <Link href="/" className="flex shrink-0 items-center gap-4">
          <span className="font-display text-5xl leading-none font-bold tracking-tight">MSSL</span>
          <span className="text-muted hidden text-[10px] leading-relaxed tracking-wider uppercase xl:block">
            Microsoft
            <br />
            Soccer League
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-2 py-2 text-sm font-medium transition-colors xl:px-3",
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
            className="bg-surface-muted hover:text-brand squircle inline-flex h-10 w-10 items-center justify-center rounded-lg lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Primary mobile" className="site-width pb-3 lg:hidden">
          <ul className="bg-surface-muted squircle grid gap-1 rounded-2xl p-3">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-full px-3 py-3 text-sm font-medium",
                    isActive(link.href) ? "bg-surface text-brand" : "hover:text-brand",
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
        className="text-brand bg-surface-muted rounded-full px-3 py-2 text-sm font-semibold hover:underline"
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
      className="border-subtle hover:bg-surface-muted flex items-center gap-2 rounded-full border py-1 pr-3 pl-1"
      title={`${user.name ?? user.email ?? "Account"} — ${role}`}
    >
      <span
        aria-hidden
        className="bg-brand text-brand-contrast squircle flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
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
