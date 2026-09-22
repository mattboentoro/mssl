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
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Sign up as free agent",
  description: "Ask the Microsoft Soccer League to find you a team for the coming season.",
};

// The page shows the signed-in player their own request, so it can never be
// cached across visitors.
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<FreeAgentStatus, "warning" | "accent" | "success" | "neutral"> = {
  PENDING: "warning",
  CONTACTED: "accent",
  PLACED: "success",
  DECLINED: "neutral",
};

export default async function FreeAgentsPage() {
  const user = await getCurrentUser();

  const divisions = await prisma.division.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const email = user?.email?.trim().toLowerCase();
  const existing = email
    ? await prisma.freeAgentRequest.findUnique({
        where: { submittedByEmail: email },
        include: { preferredDivision: { select: { name: true } } },
      })
    : null;

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
                      phone: existing.phone,
                      notes: existing.notes,
                    }
                  : null
              }
              divisions={divisions}
              isUpdate={existing !== null}
            />
          </Card>

          <div className="grid gap-4">
            {existing ? (
              <Card className="p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">Status</h2>
                  <Badge tone={STATUS_TONES[existing.status as FreeAgentStatus]}>
                    {FREE_AGENT_STATUS_LABELS[existing.status as FreeAgentStatus] ??
                      existing.status}
                  </Badge>
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

                {existing.reviewNote ? (
                  <Alert className="mt-4" title="From the league" tone="info">
                    {existing.reviewNote}
                  </Alert>
                ) : null}

                <div className="mt-5">
                  <WithdrawFreeAgentForm />
                </div>
              </Card>
            ) : null}

            <Card className="p-6">
              <h2 className="text-lg font-semibold tracking-tight">What happens next</h2>
              <ol className="text-muted mt-3 grid gap-2 text-sm">
                <li>1. The league reviews new requests before each matchweek.</li>
                <li>2. Captains with a space get your details and contact you directly.</li>
                <li>3. Once you are placed, your request is closed off here.</li>
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
