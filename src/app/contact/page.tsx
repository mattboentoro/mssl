import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Contact",
  description: "MSSL league officers, referee contacts and frequently asked questions.",
};
export const dynamic = "force-dynamic";

const OFFICERS = [
  {
    role: "League commissioner",
    name: "Alex Board",
    email: "alex.board@example.com",
    blurb: "Fixtures, disputes, disciplinary appeals and anything that needs a final decision.",
  },
  {
    role: "Referee coordinator",
    name: "Riley Whistle",
    email: "riley.whistle@example.com",
    blurb: "Referee recruitment, the msslrefs distribution list and match-day cover.",
  },
  {
    role: "Registrar",
    name: "Morgan Keeper",
    email: "morgan.keeper@example.com",
    blurb: "Team registration, player eligibility and roster changes.",
  },
  {
    role: "Site maintainer",
    name: "MSSL Web Team",
    email: "mssl-web@example.com",
    blurb: "Bugs, feature requests and access problems with this site.",
  },
];

const FAQ = [
  {
    q: "How do I become an MSSL referee?",
    a: "Email the referee coordinator. Once you are added to the msslrefs distribution list, sign in here with your Microsoft account and Referee Control appears automatically \u2014 membership is checked live against Microsoft Graph, so there is no separate account to create.",
  },
  {
    q: "I am on msslrefs but I do not see Referee Control.",
    a: "Sign out and back in. Roles are cached on your session for a few minutes, and directory changes can take a little longer to propagate. If it still does not appear, your tenant may not have granted the GroupMember.Read.All consent this site needs.",
  },
  {
    q: "The score in the table is wrong. Can you edit it?",
    a: "Not directly \u2014 standings are computed from game reports and nothing else. Ask a league admin to dispute the report; the referee refiles it, or an admin records an override with a written reason. Every one of those steps is written to the audit log.",
  },
  {
    q: "How do I add a fixture to my calendar?",
    a: "Use the Export .ics button on the schedule page. Filters are carried into the export, so you can subscribe to just your team's fixtures.",
  },
  {
    q: "Who can see the referee's incident notes?",
    a: "Only league admins and the referee who filed the report. Incident text is never shown on public pages.",
  },
  {
    q: "My team needs to postpone a match.",
    a: "Contact the commissioner at least 48 hours before kickoff. Admins reschedule or postpone through Match Control; the fixture and everyone's calendar feed update automatically.",
  },
];

export default async function ContactPage() {
  const referees = await prisma.referee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, certification: true },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Get in touch"
        title="Contact"
        description="The MSSL is run by volunteers. Point your question at the right person and you will get an answer faster."
      />

      <div className="space-y-10">
        <section aria-labelledby="officers">
          <h2 id="officers" className="mb-3 text-lg font-semibold">
            League officers
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {OFFICERS.map((officer) => (
              <Card key={officer.email} as="li" className="p-4">
                <p className="text-brand text-xs font-semibold tracking-wide uppercase">
                  {officer.role}
                </p>
                <p className="mt-1 font-semibold">{officer.name}</p>
                <a
                  href={`mailto:${officer.email}`}
                  className="text-accent font-mono text-xs break-all hover:underline"
                >
                  {officer.email}
                </a>
                <p className="text-muted mt-2 text-sm">{officer.blurb}</p>
              </Card>
            ))}
          </ul>
        </section>

        <section aria-labelledby="referees">
          <h2 id="referees" className="mb-3 text-lg font-semibold">
            Match officials
          </h2>
          <p className="text-muted mb-3 text-sm">
            Everyone here is a member of the <code className="font-mono">msslrefs</code>{" "}
            distribution list.
          </p>
          <Card className="divide-subtle divide-y">
            {referees.map((referee) => (
              <div
                key={referee.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{referee.name}</p>
                  <a
                    href={`mailto:${referee.email}`}
                    className="text-muted font-mono text-xs hover:underline"
                  >
                    {referee.email}
                  </a>
                </div>
                {referee.certification ? (
                  <span className="text-muted text-xs">{referee.certification}</span>
                ) : null}
              </div>
            ))}
          </Card>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="mb-3 text-lg font-semibold">
            Frequently asked questions
          </h2>
          <div className="space-y-2">
            {FAQ.map((item) => (
              <Card key={item.q} as="article">
                <details className="group">
                  <summary className="hover:bg-surface-muted cursor-pointer list-none rounded-xl p-4 text-sm font-medium">
                    <span className="text-brand mr-2 inline-block transition-transform group-open:rotate-90">
                      &rsaquo;
                    </span>
                    {item.q}
                  </summary>
                  <p className="text-muted px-4 pb-4 pl-9 text-sm">{item.a}</p>
                </details>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="mailing">
          <h2 id="mailing" className="mb-3 text-lg font-semibold">
            Distribution lists
          </h2>
          <Card className="p-5 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-mono font-semibold">msslrefs</dt>
                <dd className="text-muted">
                  Match officials. Membership grants Referee Control on this site.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold">mssl-captains</dt>
                <dd className="text-muted">
                  One captain per team. Fixture and roster announcements.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold">mssl-all</dt>
                <dd className="text-muted">Everyone playing this season. Low traffic.</dd>
              </div>
              <div>
                <dt className="font-mono font-semibold">mssl-board</dt>
                <dd className="text-muted">The league board. Use this for disputes and appeals.</dd>
              </div>
            </dl>
          </Card>
        </section>
      </div>

      <p className="text-muted mt-8 text-sm">
        Looking for the rules instead?{" "}
        <Link href="/rules" className="underline">
          Read the league handbook
        </Link>
        .
      </p>
    </div>
  );
}
