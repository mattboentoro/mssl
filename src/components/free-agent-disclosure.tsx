import type { ReactNode } from "react";

import { MatchDisclosureStack } from "@/components/match-display";
import { Badge, Card } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/dates";
import { FREE_AGENT_STATUS_LABELS, PLAYER_POSITION_LABELS, type PlayerPosition } from "@/lib/enums";
import type { FreeAgentPoolEntry } from "@/lib/free-agents";

export function FreeAgentDisclosure({
  request,
  children,
  showStatus = true,
  showContactHistory = true,
}: {
  request: FreeAgentPoolEntry;
  children?: ReactNode;
  showStatus?: boolean;
  showContactHistory?: boolean;
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
    <MatchDisclosureStack>
      <Card as="details" className="group overflow-hidden">
        <summary
          className={`hover:bg-surface-muted grid cursor-pointer list-none gap-3 p-4 transition sm:items-center ${
            showStatus
              ? "sm:grid-cols-[minmax(10rem,1.5fr)_minmax(6rem,0.7fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto]"
              : "sm:grid-cols-[minmax(10rem,1.5fr)_minmax(6rem,0.7fr)_minmax(8rem,1fr)_minmax(8rem,1fr)]"
          }`}
        >
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
          {showStatus ? (
            <Badge tone={request.systemStatus === "CONTACTED" ? "accent" : "neutral"}>
              {FREE_AGENT_STATUS_LABELS[request.systemStatus]}
            </Badge>
          ) : null}
        </summary>

        <div className="border-subtle border-t p-5">
          <dl className={`grid gap-4 text-sm ${showStatus ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <div>
              <dt className="text-muted text-xs font-medium uppercase">Email</dt>
              <dd className="mt-1">
                <a className="hover:underline" href={`mailto:${request.submittedByEmail}`}>
                  {request.submittedByEmail}
                </a>
              </dd>
            </div>
            {showStatus ? (
              <div>
                <dt className="text-muted text-xs font-medium uppercase">Status</dt>
                <dd className="mt-1">{FREE_AGENT_STATUS_LABELS[request.systemStatus]}</dd>
              </div>
            ) : null}
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

          {showContactHistory ? (
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
          ) : null}

          {children ? <div className="border-subtle mt-5 border-t pt-4">{children}</div> : null}
        </div>
      </Card>
    </MatchDisclosureStack>
  );
}
