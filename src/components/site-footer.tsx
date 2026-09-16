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
    <footer className="border-subtle bg-surface mt-16 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-bold">Microsoft Soccer League</p>
          <p className="text-muted mt-2 text-sm">
            The employee-run soccer league for the Microsoft community. Fixtures, results and
            standings are generated from referee match reports.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">{column.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
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
      <div className="border-subtle text-muted border-t px-4 py-4 text-center text-xs">
        Internal Microsoft community site. Not an official Microsoft product.
      </div>
    </footer>
  );
}
