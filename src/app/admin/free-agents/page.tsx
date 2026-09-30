import Link from "next/link";

import { deleteFreeAgentRequest } from "@/app/admin/actions";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import { FreeAgentDisclosure } from "@/components/free-agent-disclosure";
import { buttonClass, Card, EmptyState, inputClass } from "@/components/ui";
import { FREE_AGENT_STATUSES, FREE_AGENT_STATUS_LABELS, type FreeAgentStatus } from "@/lib/enums";
import { listAvailableFreeAgents } from "@/lib/free-agents";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free agents" };

function statusFilter(value: string | undefined): FreeAgentStatus | undefined {
  return FREE_AGENT_STATUSES.find((status) => status === value);
}

export default async function AdminFreeAgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; division?: string }>;
}) {
  const params = await searchParams;
  const selectedStatus = statusFilter(params.status);
  const [requests, divisions] = await Promise.all([
    listAvailableFreeAgents(prisma, {
      status: selectedStatus,
      divisionId: params.division,
    }),
    prisma.division.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))_auto]" method="get">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Status</span>
            <select name="status" defaultValue={selectedStatus ?? ""} className={inputClass}>
              <option value="">All statuses</option>
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
              <option value="">All divisions</option>
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonClass("primary")}>
              Filter
            </button>
            <Link href="/admin/free-agents" className="text-muted self-center text-sm underline">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {requests.length ? (
        <div className="grid gap-2">
          {requests.map((request) => (
            <FreeAgentDisclosure key={request.id} request={request}>
              <ActionForm action={deleteFreeAgentRequest} resetOnSuccess={false}>
                <input type="hidden" name="requestId" value={request.id} />
                <SubmitButton
                  confirm={`Delete ${request.submittedByName}'s request? This cannot be undone.`}
                  variant="danger"
                >
                  Delete
                </SubmitButton>
              </ActionForm>
            </FreeAgentDisclosure>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No free agents match these filters"
          hint="Players disappear from this list automatically when they join a team."
        />
      )}
    </div>
  );
}
