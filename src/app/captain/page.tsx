import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Captain dashboard" };
export const dynamic = "force-dynamic";

export default async function CaptainPage() {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect("/signin?callbackUrl=/captain");
      forbidden();
    }
    throw error;
  }

  const contexts = user.teamContexts.filter((context) => context.role === "captain");
  const assignments = await prisma.teamCaptain.findMany({
    where: {
      userId: user.appUserId,
      status: "ACTIVE",
      revokedAt: null,
      seasonId: { not: null },
    },
    include: { team: true, season: true },
    orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
  });

  return (
    <div>
      <PageHeader
        eyebrow="Captain"
        title="Your teams"
        description="Captain access is scoped independently to each team and season."
        actions={<ButtonLink href="/captain/roster">Manage rosters</ButtonLink>}
      />
      {assignments.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {assignments.map((assignment) => (
            <Card key={assignment.id} className="p-5">
              <h2 className="font-semibold">{assignment.team.name}</h2>
              <p className="text-muted mt-1 text-sm">{assignment.season?.name}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No active team assignment"
            hint={`${contexts.length} authorization context(s) were loaded. Contact an administrator if this is unexpected.`}
          />
        </Card>
      )}
    </div>
  );
}
