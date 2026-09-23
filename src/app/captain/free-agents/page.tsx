import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";

import { placeFreeAgentAction } from "@/app/captain/free-agents/actions";
import { RosterActionForm } from "@/components/roster-action-form";
import { Badge, Card, EmptyState, PageHeader, inputClass } from "@/components/ui";
import { AuthzError, requireCaptain } from "@/lib/authz";
import {
  CaptainFreeAgentError,
  isFreeAgentStatus,
  listCaptainFreeAgents,
} from "@/lib/captain-free-agents";
import {
  FREE_AGENT_STATUSES,
  FREE_AGENT_STATUS_LABELS,
  OPEN_FREE_AGENT_STATUSES,
  PLAYER_POSITION_LABELS,
  type FreeAgentStatus,
  type PlayerPosition,
} from "@/lib/enums";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Free agents" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<FreeAgentStatus, "warning" | "accent" | "success" | "neutral"> = {
  PENDING: "warning",
  CONTACTED: "accent",
  PLACED: "success",
  DECLINED: "neutral",
};

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
  const status = params.status === "all" || isFreeAgentStatus(params.status) ? params.status : "";

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
        description="Contact details are restricted to active Captains and access is audited. Placement sends an invitation; the player joins only after accepting it."
      />
      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Status</span>
            <select className={inputClass} defaultValue={status} name="status">
              <option value="">Open requests</option>
              <option value="all">All</option>
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
            <button className="btn-primary" type="submit">
              Filter
            </button>
            <Link className="text-muted pb-2 text-sm underline" href="/captain/free-agents">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {data.requests.length ? (
        <div className="grid gap-4">
          {data.requests.map((request) => {
            const requestStatus = request.status as FreeAgentStatus;
            const open = OPEN_FREE_AGENT_STATUSES.includes(requestStatus);
            return (
              <Card as="article" className="p-5" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{request.submittedByName}</h2>
                    <a
                      className="text-muted text-sm hover:underline"
                      href={`mailto:${request.submittedByEmail}`}
                    >
                      {request.submittedByEmail}
                    </a>
                  </div>
                  <Badge tone={STATUS_TONES[requestStatus]}>
                    {FREE_AGENT_STATUS_LABELS[requestStatus]}
                  </Badge>
                </div>
                <dl className="text-muted mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium uppercase">Experience</dt>
                    <dd className="text-foreground">
                      {request.yearsExperience} year{request.yearsExperience === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Position</dt>
                    <dd className="text-foreground">
                      {PLAYER_POSITION_LABELS[request.preferredPosition as PlayerPosition] ??
                        request.preferredPosition}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Preferred division</dt>
                    <dd className="text-foreground">
                      {request.preferredDivision?.name ?? "No preference"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Submitted</dt>
                    <dd className="text-foreground">{request.createdAt.toLocaleDateString()}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <p className="text-muted text-xs font-medium uppercase">Player notes</p>
                  <p className="mt-1 text-sm whitespace-pre-line">
                    {request.notes ?? "No additional notes."}
                  </p>
                </div>
                {open ? (
                  <div className="border-subtle mt-4 border-t pt-4">
                    <p className="text-muted mb-2 text-xs font-medium uppercase">
                      Send a roster invitation
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {data.assignments.map((assignment) =>
                        assignment.seasonId ? (
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
                        ) : null,
                      )}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState title="No free-agent requests match these filters." />
        </Card>
      )}
    </div>
  );
}
