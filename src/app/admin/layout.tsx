import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert } from "@/components/ui";
import { AuthzError, requireAdmin } from "@/lib/authz";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/league", label: "League setup" },
  { href: "/admin/import", label: "CSV import" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/admin");
      return (
        <div className="mx-auto max-w-2xl py-10">
          <Alert tone="danger" title="Administrator access required">
            {error.message} Admin rights come from the configured admin group or the
            <code className="mx-1 font-mono">MSSL_ADMIN_UPNS</code> allowlist.
          </Alert>
        </div>
      );
    }
    throw error;
  }

  return (
    <div>
      <div className="border-subtle mb-6 border-b pb-4">
        <p className="text-muted text-xs font-semibold tracking-wide uppercase">Match Control</p>
        <h1 className="mt-1 text-2xl font-bold">League administration</h1>
        <p className="text-muted mt-1 text-sm">
          Signed in as {user.name ?? user.email}. Every change here is written to the audit log.
        </p>
        <nav aria-label="Admin sections" className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="border-subtle hover:bg-surface-muted rounded-lg border px-3 py-1.5 text-sm font-medium"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
