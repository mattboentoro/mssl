import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

import { placeFreeAgentAction } from "@/app/captain/free-agents/actions";
import { FreeAgentDisclosure } from "@/components/free-agent-disclosure";
import { RosterActionForm } from "@/components/roster-action-form";
import { buttonClass, Card, EmptyState, PageHeader, inputClass } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import {
  CaptainFreeAgentError,
  isFreeAgentStatus,
  listCaptainFreeAgents,
} from "@/lib/captain-free-agents";
import { FREE_AGENT_STATUSES, FREE_AGENT_STATUS_LABELS } from "@/lib/enums";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Free agents" };
export const dynamic = "force-dynamic";

export default async function CaptainFreeAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; division?: string }>;
}) {
  let user;
  try {
    user = await requireCaptain();
  } catch (error) {
    if (error instanceof AuthzError && error.status === 401) {
      redirect("/signin?callbackUrl=/captain/free-agents");
    }
    forbidden();
  }
  const params = await searchParams;
  const status = isFreeAgentStatus(params.status) ? params.status : "";

  let data;
  try {
    data = await listCaptainFreeAgents(prisma, {
      actorId: user.appUserId,
      filters: { status, divisionId: params.division },
    });
  } catch (error) {
    if (error instanceof CaptainFreeAgentError && error.status === 403) forbidden();
    throw error;
  }
  const divisions = await prisma.division.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div>
      <PageHeader
        backHref="/captain"
        backLabel="Captain dashboard"
        eyebrow="Captain"
        title="Free agents"
        description="Contact details are restricted to active Captains. Sending an invitation automatically records your team as having contacted the player."
      />
      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Status</span>
            <select className={inputClass} defaultValue={status} name="status">
              <option value="">All statuses</option>
              {FREE_AGENT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {FREE_AGENT_STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Division</span>
            <select className={inputClass} defaultValue={params.division ?? ""} name="division">
              <option value="">All divisions</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button className={buttonClass("primary")} type="submit">
              Filter
            </button>
            <Link className="text-muted pb-2 text-sm underline" href="/captain/free-agents">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {data.requests.length ? (
        <div className="grid gap-2">
          {data.requests.map((request) => (
            <FreeAgentDisclosure key={request.id} request={request}>
              <p className="text-muted mb-2 text-xs font-medium uppercase">
                Send a roster invitation
              </p>
              <div className="flex flex-wrap gap-2">
                {data.assignments.map((assignment) => {
                  if (!assignment.seasonId) return null;
                  const hasOpenInvitation = request.invitations.some(
                    (invitation) =>
                      invitation.seasonId === assignment.seasonId &&
                      invitation.teamId === assignment.teamId &&
                      invitation.status === "PENDING",
                  );
                  return hasOpenInvitation ? (
                    <span
                      className="bg-surface-muted border-subtle rounded-lg border px-3 py-2 text-sm"
                      key={assignment.id}
                    >
                      {assignment.team.name} · invitation pending
                    </span>
                  ) : (
                    <RosterActionForm
                      action={placeFreeAgentAction}
                      key={assignment.id}
                      submitLabel={`${assignment.team.name} · ${assignment.season?.name}`}
                      variant="secondary"
                    >
                      <input name="requestId" type="hidden" value={request.id} />
                      <input name="seasonId" type="hidden" value={assignment.seasonId} />
                      <input name="teamId" type="hidden" value={assignment.teamId} />
                    </RosterActionForm>
                  );
                })}
              </div>
            </FreeAgentDisclosure>
          ))}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            title="No free agents match these filters"
            hint="Players disappear from this list automatically when they join a team."
          />
        </Card>
      )}
    </div>
  );
}
