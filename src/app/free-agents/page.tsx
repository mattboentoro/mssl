import type { Metadata } from "next";

import { FreeAgentForm, WithdrawFreeAgentForm } from "@/components/free-agent-form";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import {
  FREE_AGENT_STATUS_LABELS,
  PLAYER_POSITION_LABELS,
  type FreeAgentStatus,
  type PlayerPosition,
} from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { getActiveTeamAssociation } from "@/lib/free-agent-eligibility";
import { prisma } from "@/lib/prisma";
import { getPublicDivisions } from "@/lib/public-queries";

export const metadata: Metadata = {
  title: "Sign up as free agent",
  description: "Ask the Microsoft Soccer League to find you a team for the coming season.",
};

// The page shows the signed-in player their own request, so it can never be
// cached across visitors.
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<FreeAgentStatus, "accent" | "neutral"> = {
  PENDING: "neutral",
  CONTACTED: "accent",
};

export default async function FreeAgentsPage() {
  const user = await getCurrentUser();

  const divisions = await getPublicDivisions();

  const email = user?.email?.trim().toLowerCase();
  const [existing, activeTeam] = await Promise.all([
    email
      ? prisma.freeAgentRequest.findUnique({
          where: { submittedByEmail: email },
          include: {
            preferredDivision: { select: { name: true } },
            invitations: {
              include: {
                team: { select: { name: true } },
                season: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        })
      : null,
    user?.appUserId ? getActiveTeamAssociation(prisma, user.appUserId) : Promise.resolve(null),
  ]);
  const status: FreeAgentStatus = existing?.invitations.length ? "CONTACTED" : "PENDING";
  const contactedTeams = existing
    ? [
        ...new Map(
          existing.invitations.map((invitation) => [
            `${invitation.seasonId}:${invitation.teamId}`,
            invitation,
          ]),
        ).values(),
      ]
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Players"
        title="Sign up as free agent"
        description="Without a team? Tell the league a little about yourself and we will pass your details to captains who have room in their squad."
      />

      {!user ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">Sign in to continue</h2>
          <p className="text-muted mt-2 text-sm">
            Requests are tied to your Microsoft account so captains know who they are talking to,
            and so you can come back and update or withdraw yours later.
          </p>
          <div className="mt-4">
            <ButtonLink href="/signin?callbackUrl=/free-agents">Sign in</ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <Card className="p-6">
            {activeTeam ? (
              <>
                <h2 className="text-lg font-semibold tracking-tight">
                  Already associated with a team
                </h2>
                <Alert className="mt-4" tone="info">
                  You are currently associated with {activeTeam.name}. You can sign up as a free
                  agent after leaving your team.
                </Alert>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold tracking-tight">
                  {existing ? "Your request" : "About you"}
                </h2>
                <p className="text-muted mt-1 mb-5 text-sm">
                  Filed as <span className="text-foreground font-medium">{user.name ?? email}</span>{" "}
                  &middot; {email}
                </p>

                <FreeAgentForm
                  defaults={
                    existing
                      ? {
                          yearsExperience: existing.yearsExperience,
                          preferredPosition: existing.preferredPosition,
                          preferredDivisionId: existing.preferredDivisionId,
                          notes: existing.notes,
                        }
                      : null
                  }
                  divisions={divisions}
                  isUpdate={existing !== null}
                />
              </>
            )}
          </Card>

          <div className="grid gap-4">
            {existing && !activeTeam ? (
              <Card className="p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">Status</h2>
                  <Badge tone={STATUS_TONES[status]}>{FREE_AGENT_STATUS_LABELS[status]}</Badge>
                </div>

                <dl className="mt-4 grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted text-xs font-semibold tracking-wide uppercase">
                      Submitted
                    </dt>
                    <dd className="mt-0.5">{formatDate(existing.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs font-semibold tracking-wide uppercase">
                      Position
                    </dt>
                    <dd className="mt-0.5">
                      {PLAYER_POSITION_LABELS[existing.preferredPosition as PlayerPosition] ??
                        existing.preferredPosition}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs font-semibold tracking-wide uppercase">
                      Division
                    </dt>
                    <dd className="mt-0.5">
                      {existing.preferredDivision?.name ?? "No preference"}
                    </dd>
                  </div>
                </dl>

                {contactedTeams.length ? (
                  <div className="mt-4">
                    <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                      Teams that reached out
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {contactedTeams.map((invitation) => (
                        <li key={`${invitation.seasonId}:${invitation.teamId}`}>
                          <Badge tone="accent">
                            {invitation.team.name} · {invitation.season.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-5">
                  <WithdrawFreeAgentForm />
                </div>
              </Card>
            ) : null}

            <Card className="p-6">
              <h2 className="text-lg font-semibold tracking-tight">What happens next</h2>
              <ol className="text-muted mt-3 grid gap-2 text-sm">
                <li>1. Your request appears immediately as Not placed.</li>
                <li>2. A team invitation changes the status to Contacted.</li>
                <li>3. Once you join a team, your request leaves the free-agent list.</li>
              </ol>
              <p className="text-muted mt-4 text-sm">
                Already know a captain? You can join their squad directly — there is no need to wait
                on this list.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
