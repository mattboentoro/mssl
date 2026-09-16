import Link from "next/link";

const COLUMNS = [
  {
    title: "League",
    links: [
      { href: "/schedule", label: "Schedule & results" },
      { href: "/standings", label: "Standings" },
      { href: "/teams", label: "Teams" },
    ],
  },
  {
    title: "Info",
    links: [
      { href: "/rules", label: "Rules & regulations" },
      { href: "/faq", label: "FAQ" },
      { href: "/schedule/calendar.ics", label: "Calendar (.ics)" },
    ],
  },
  {
    title: "Officials",
    links: [
      { href: "/referee", label: "Referee control" },
      { href: "/signin", label: "Sign in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-surface-muted mt-10">
      <div className="site-width grid gap-8 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-bold uppercase">Microsoft Soccer League</p>
          <p className="text-muted mt-3 max-w-xs text-xs leading-relaxed">
            The employee-run soccer league for the Microsoft community. Fixtures, results and
            standings are generated from referee match reports.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-lg font-semibold">{column.title}</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="site-width text-muted pb-6 text-xs">
        Internal Microsoft community site. Not an official Microsoft product.
      </div>
    </footer>
  );
}
