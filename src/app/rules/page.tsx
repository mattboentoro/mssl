import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { config } from "@/lib/config";
import { getDocuments } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Rules & documents",
  description: "MSSL competition rules, code of conduct and downloadable documents.",
};
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  RULES: "Rules",
  FORMS: "Forms",
  POLICY: "Policy",
  OTHER: "Other",
};

const RULES: { heading: string; items: string[] }[] = [
  {
    heading: "Match format",
    items: [
      "Two halves of 45 minutes with a 15-minute interval, unless the fixture notes say otherwise.",
      "Squads of up to 18; unlimited rolling substitutions, made at a stoppage with the referee's permission.",
      "A match may start with a minimum of seven players. Falling below seven ends the match as a forfeit.",
      `A forfeited match is recorded as ${config.standings.forfeit.winner}\u2013${config.standings.forfeit.loser} to the opposition. If both teams forfeit, both are recorded as losing ${config.standings.forfeit.loser}\u2013${config.standings.forfeit.winner}.`,
    ],
  },
  {
    heading: "Eligibility",
    items: [
      "Players must be Microsoft employees, interns or vendors with a valid badge.",
      "A player may be registered to exactly one team per season.",
      "Roster changes close when the referee locks the match. Anyone not on the locked roster cannot appear on the game report.",
    ],
  },
  {
    heading: "Results and standings",
    items: [
      "Three points for a win, one for a draw, none for a loss.",
      "Standings are computed only from submitted referee game reports \u2014 no one can hand-edit a table.",
      "Tiebreakers, in order: points, goal difference, goals for, head-to-head record, then fewest disciplinary points.",
      config.standings.includeUnconfirmed
        ? "A submitted report counts immediately; an admin confirmation locks it in."
        : "Only reports confirmed by a league admin count towards the table.",
    ],
  },
  {
    heading: "Discipline",
    items: [
      "A yellow card is worth 1 disciplinary point, a red card 3.",
      "Two yellow cards in one match equal a red card and an automatic one-match suspension.",
      "A straight red card carries a minimum one-match suspension; the disciplinary committee may extend it.",
      "Accumulating five yellow cards in a season triggers a one-match suspension.",
    ],
  },
  {
    heading: "Referees",
    items: [
      "Every match is officiated by a member of the msslrefs distribution list.",
      "Referees self-assign to open fixtures, then lock the match to freeze the fixture details and rosters.",
      "The game report \u2014 score, scorers, cards and any incident notes \u2014 must be filed within 24 hours of the final whistle.",
      "Once submitted, a report is read-only to the referee. Corrections go through a league admin, who must record a reason.",
    ],
  },
  {
    heading: "Code of conduct",
    items: [
      "Play hard, play fair. This is a workplace league: everything here is covered by Microsoft's standards of business conduct.",
      "Abuse of officials, opponents or teammates is not tolerated and is reported to the league board.",
      "Report injuries to the referee immediately so they can be captured in the incident section of the game report.",
      "Disputes are raised with the league board within 48 hours of the match.",
    ],
  },
];

export default async function RulesPage() {
  const documents = await getDocuments();
  const byCategory = new Map<string, typeof documents>();
  for (const doc of documents) {
    const bucket = byCategory.get(doc.category);
    if (bucket) bucket.push(doc);
    else byCategory.set(doc.category, [doc]);
  }

  return (
    <div>
      <PageHeader
        eyebrow="League handbook"
        title="Rules & documents"
        description="The competition rules that referees apply on the pitch, plus the forms and policies you may need off it."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {RULES.map((section) => (
            <section
              key={section.heading}
              aria-labelledby={`rule-${section.heading.replace(/\s/g, "-")}`}
            >
              <h2
                id={`rule-${section.heading.replace(/\s/g, "-")}`}
                className="mb-3 text-lg font-semibold"
              >
                {section.heading}
              </h2>
              <Card className="p-5">
                <ul className="space-y-2 text-sm">
                  {section.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="text-brand mt-0.5">
                        &bull;
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Downloads</h2>
          {documents.length === 0 ? (
            <EmptyState title="No documents published yet" />
          ) : (
            <div className="space-y-5">
              {[...byCategory.entries()].map(([category, docs]) => (
                <div key={category}>
                  <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
                    {CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <Card className="divide-subtle divide-y">
                    {docs.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.url}
                        className="hover:bg-surface-muted block p-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{doc.title}</span>
                          {doc.fileType ? <Badge>{doc.fileType.toUpperCase()}</Badge> : null}
                        </div>
                        {doc.description ? (
                          <p className="text-muted mt-1 text-xs">{doc.description}</p>
                        ) : null}
                      </a>
                    ))}
                  </Card>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted mt-4 text-xs">
            Something missing or out of date?{" "}
            <Link href="/contact" className="underline">
              Contact the league board
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}
