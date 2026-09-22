import Link from "next/link";

import { deleteFreeAgentRequest, reviewFreeAgentRequest } from "@/app/admin/actions";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { Badge, Card, EmptyState, inputClass } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/dates";
import {
  FREE_AGENT_STATUSES,
  FREE_AGENT_STATUS_LABELS,
  OPEN_FREE_AGENT_STATUSES,
  PLAYER_POSITION_LABELS,
  type FreeAgentStatus,
  type PlayerPosition,
} from "@/lib/enums";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free agents" };

const STATUS_TONES: Record<FreeAgentStatus, "warning" | "accent" | "success" | "neutral"> = {
  PENDING: "warning",
  CONTACTED: "accent",
  PLACED: "success",
  DECLINED: "neutral",
};

function isFreeAgentStatus(value: string | undefined): value is FreeAgentStatus {
  return value !== undefined && (FREE_AGENT_STATUSES as readonly string[]).includes(value);
}

export default async function AdminFreeAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; division?: string }>;
}) {
  const params = await searchParams;

  // "open" is the landing view: the two statuses that still need somebody to
  // act. An explicit status wins; anything unrecognised falls back to open.
  const statusFilter = isFreeAgentStatus(params.status)
    ? { status: params.status }
    : params.status === "all"
      ? {}
      : { status: { in: [...OPEN_FREE_AGENT_STATUSES] } };

  const where = {
    ...statusFilter,
    ...(params.division ? { preferredDivisionId: params.division } : {}),
  };

  const [requests, divisions, openCount] = await Promise.all([
    prisma.freeAgentRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { preferredDivision: { select: { name: true } } },
    }),
    prisma.division.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.freeAgentRequest.count({ where: { status: { in: [...OPEN_FREE_AGENT_STATUSES] } } }),
  ]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]" method="get">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Status</span>
            <select name="status" defaultValue={params.status ?? ""} className={inputClass}>
              <option value="">Needs review ({openCount})</option>
              <option value="all">All</option>
              {FREE_AGENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {FREE_AGENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Division</span>
            <select name="division" defaultValue={params.division ?? ""} className={inputClass}>
              <option value="">All</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <div />
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">
              Filter
            </button>
            <Link href="/admin/free-agents" className="text-muted self-center text-sm underline">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {requests.length === 0 ? (
        <EmptyState
          title="No free-agent requests"
          hint="Players who sign up without a team appear here for review."
        />
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => {
            const status = request.status as FreeAgentStatus;
            return (
              <Card key={request.id} className="p-5" as="article">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold tracking-tight">
                      {request.submittedByName}
                    </h2>
                    <p className="text-muted mt-0.5 text-sm">
                      <a className="hover:underline" href={`mailto:${request.submittedByEmail}`}>
                        {request.submittedByEmail}
                      </a>
                      {request.phone ? ` \u00B7 ${request.phone}` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[status]}>
                    {FREE_AGENT_STATUS_LABELS[status] ?? request.status}
                  </Badge>
                </div>

                <dl className="text-muted mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-medium uppercase">Experience</dt>
                    <dd className="text-foreground mt-0.5">
                      {request.yearsExperience} year{request.yearsExperience === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Position</dt>
                    <dd className="text-foreground mt-0.5">
                      {PLAYER_POSITION_LABELS[request.preferredPosition as PlayerPosition] ??
                        request.preferredPosition}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Division</dt>
                    <dd className="text-foreground mt-0.5">
                      {request.preferredDivision?.name ?? "No preference"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase">Submitted</dt>
                    <dd className="text-foreground mt-0.5" title={formatDate(request.createdAt)}>
                      {relativeTime(request.createdAt)}
                    </dd>
                  </div>
                </dl>

                {request.notes ? (
                  <p className="border-subtle mt-4 border-l-2 pl-3 text-sm whitespace-pre-line">
                    {request.notes}
                  </p>
                ) : null}

                <div className="border-subtle mt-4 border-t pt-4">
                  <ActionForm action={reviewFreeAgentRequest} resetOnSuccess={false}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
                      <label className="text-sm">
                        <span className="text-muted mb-1 block text-xs font-medium uppercase">
                          Status
                        </span>
                        <select name="status" defaultValue={request.status} className={inputClass}>
                          {FREE_AGENT_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {FREE_AGENT_STATUS_LABELS[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="text-muted mb-1 block text-xs font-medium uppercase">
                          Note to the player
                        </span>
                        <input
                          className={inputClass}
                          defaultValue={request.reviewNote ?? ""}
                          maxLength={500}
                          name="reviewNote"
                          placeholder="Passed your details to Redmond Rovers."
                        />
                      </label>
                      <SubmitButton>Save</SubmitButton>
                    </div>
                  </ActionForm>

                  <div className="mt-3">
                    <ActionForm action={deleteFreeAgentRequest} resetOnSuccess={false}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <SubmitButton
                        confirm={`Delete ${request.submittedByName}'s request? This cannot be undone.`}
                        variant="danger"
                      >
                        Delete
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </div>

                {request.reviewedAt ? (
                  <p className="text-muted mt-3 text-xs">
                    Last reviewed {relativeTime(request.reviewedAt)}
                    {request.reviewedByEmail ? ` by ${request.reviewedByEmail}` : ""}.
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
