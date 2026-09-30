import type { ReactNode } from "react";

import { Badge, Card } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/dates";
import { FREE_AGENT_STATUS_LABELS, PLAYER_POSITION_LABELS, type PlayerPosition } from "@/lib/enums";
import type { FreeAgentPoolEntry } from "@/lib/free-agents";

export function FreeAgentDisclosure({
  request,
  children,
}: {
  request: FreeAgentPoolEntry;
  children?: ReactNode;
}) {
  const contactedTeams = [
    ...new Map(
      request.invitations.map((invitation) => [
        `${invitation.seasonId}:${invitation.teamId}`,
        invitation,
      ]),
    ).values(),
  ];

  return (
    <Card as="details" className="group overflow-hidden">
      <summary className="hover:bg-surface-muted grid cursor-pointer list-none gap-3 p-4 transition sm:grid-cols-[minmax(10rem,1.5fr)_minmax(6rem,0.7fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate font-semibold">{request.submittedByName}</p>
          <p className="text-muted text-xs group-open:hidden">Select to view contact details</p>
        </div>
        <div>
          <p className="text-muted text-xs font-medium uppercase">Experience</p>
          <p className="text-sm">
            {request.yearsExperience} year{request.yearsExperience === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="text-muted text-xs font-medium uppercase">Position</p>
          <p className="text-sm">
            {PLAYER_POSITION_LABELS[request.preferredPosition as PlayerPosition] ??
              request.preferredPosition}
          </p>
        </div>
        <div>
          <p className="text-muted text-xs font-medium uppercase">Division</p>
          <p className="text-sm">{request.preferredDivision?.name ?? "No preference"}</p>
        </div>
        <Badge tone={request.systemStatus === "CONTACTED" ? "accent" : "neutral"}>
          {FREE_AGENT_STATUS_LABELS[request.systemStatus]}
        </Badge>
      </summary>

      <div className="border-subtle border-t p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted text-xs font-medium uppercase">Email</dt>
            <dd className="mt-1">
              <a className="hover:underline" href={`mailto:${request.submittedByEmail}`}>
                {request.submittedByEmail}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium uppercase">Status</dt>
            <dd className="mt-1">{FREE_AGENT_STATUS_LABELS[request.systemStatus]}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium uppercase">Submitted</dt>
            <dd className="mt-1" title={formatDate(request.createdAt)}>
              {relativeTime(request.createdAt)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <p className="text-muted text-xs font-medium uppercase">Description</p>
          <p className="mt-1 text-sm whitespace-pre-line">
            {request.notes ?? "No additional description."}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-muted text-xs font-medium uppercase">Teams that reached out</p>
          {contactedTeams.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {contactedTeams.map((invitation) => (
                <li key={`${invitation.seasonId}:${invitation.teamId}`}>
                  <Badge tone="accent">
                    {invitation.team.name} · {invitation.season.name}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted mt-1 text-sm">No team has sent an invitation yet.</p>
          )}
        </div>

        {children ? <div className="border-subtle mt-5 border-t pt-4">{children}</div> : null}
      </div>
    </Card>
  );
}
