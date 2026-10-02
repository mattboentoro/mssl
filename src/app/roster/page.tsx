import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  cancelJoinRequestAction,
  leaveRosterAction,
  requestToJoinAction,
  respondToInvitationAction,
} from "@/app/roster/actions";
import { RosterActionForm } from "@/components/roster-action-form";
import { Badge, Card, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

export default async function RosterPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin?callbackUrl=/roster");
  }
  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
  const [memberships, captainAssignments, invitations, requests, seasons] = await Promise.all([
    prisma.teamMembership.findMany({
      where: { userId: user.appUserId, status: "ACTIVE", endedAt: null },
      include: { team: true, season: true },
      orderBy: { joinedAt: "desc" },
    }),
    prisma.teamCaptain.findMany({
      where: {
        userId: user.appUserId,
        status: "ACTIVE",
        revokedAt: null,
        seasonId: { not: null },
      },
      include: { team: true, season: true },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.rosterInvitation.findMany({
      where: {
        status: "PENDING",
        OR: [{ invitedUserId: user.appUserId }, { normalizedEmail }],
      },
      include: { team: true, season: true, invitedBy: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rosterJoinRequest.findMany({
      where: { requesterId: user.appUserId },
      include: { team: true, season: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.season.findMany({
      where: { isActive: true },
      include: {
        teamEntries: {
          include: { team: true },
          orderBy: { team: { name: "asc" } },
        },
      },
      orderBy: { startsOn: "desc" },
    }),
  ]);
  const currentTeams = new Map(
    memberships.map((membership) => [
      `${membership.seasonId}:${membership.teamId}`,
      {
        id: membership.id,
        seasonId: membership.seasonId,
        teamId: membership.teamId,
        team: membership.team,
        season: membership.season,
        membershipId: membership.id as string | null,
        captain: false,
      },
    ]),
  );
  for (const assignment of captainAssignments) {
    if (!assignment.season) continue;
    const key = `${assignment.seasonId}:${assignment.teamId}`;
    const existing = currentTeams.get(key);
    if (existing) {
      existing.captain = true;
    } else {
      currentTeams.set(key, {
        id: `captain:${assignment.id}`,
        seasonId: assignment.season.id,
        teamId: assignment.teamId,
        team: assignment.team,
        season: assignment.season,
        membershipId: null,
        captain: true,
      });
    }
  }
  const yourTeams = [...currentTeams.values()];

  return (
    <div>
      <PageHeader
        backHref={user.isCaptain ? "/captain/roster" : "/account"}
        backLabel={user.isCaptain ? "Manage rosters" : "Your account"}
        eyebrow="Players"
        title="Roster"
        description="Accept team invitations, request to join a team, or leave your current squad."
      />

      <div className="grid gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Your teams</h2>
          {yourTeams.length ? (
            <div className="mt-4 grid gap-3">
              {yourTeams.map((membership) => (
                <div
                  className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  key={membership.id}
                >
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {membership.team.name}
                      {membership.captain ? <Badge tone="brand">Captain</Badge> : null}
                    </p>
                    <p className="text-muted text-sm">{membership.season.name}</p>
                  </div>
                  {membership.membershipId ? (
                    <RosterActionForm
                      action={leaveRosterAction}
                      submitLabel="Leave team"
                      variant="danger"
                    >
                      <input
                        type="hidden"
                        name="membershipId"
                        value={membership.membershipId}
                      />
                    </RosterActionForm>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="You are not on an active roster." />
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Pending invitations</h2>
          {invitations.length ? (
            <div className="mt-4 grid gap-3">
              {invitations.map((invitation) => (
                <div className="border-subtle rounded-lg border p-4" key={invitation.id}>
                  <p className="font-medium">
                    {invitation.team.name} <span className="text-muted">·</span>{" "}
                    {invitation.season.name}
                  </p>
                  <p className="text-muted mt-1 text-sm">
                    Invited by {invitation.invitedBy.displayName}
                    {invitation.message ? `: ${invitation.message}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <RosterActionForm
                      action={respondToInvitationAction}
                      submitLabel="Accept"
                      variant="success"
                    >
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <input type="hidden" name="decision" value="ACCEPTED" />
                    </RosterActionForm>
                    <RosterActionForm
                      action={respondToInvitationAction}
                      submitLabel="Reject"
                      variant="danger"
                    >
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                    </RosterActionForm>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-3 text-sm">No open invitations.</p>
          )}
        </Card>

        {user.isPlayer ? (
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Request to join</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {seasons.flatMap((season) =>
                season.teamEntries
                  .filter((entry) => !currentTeams.has(`${season.id}:${entry.team.id}`))
                  .map(({ team }) => (
                    <RosterActionForm
                      action={requestToJoinAction}
                      className="border-subtle rounded-lg border p-4"
                      key={`${season.id}-${team.id}`}
                      submitLabel="Send request"
                    >
                      <input type="hidden" name="seasonId" value={season.id} />
                      <input type="hidden" name="teamId" value={team.id} />
                      <p className="font-medium">{team.name}</p>
                      <p className="text-muted mb-3 text-sm">{season.name}</p>
                      <Field label="Message (optional)" htmlFor={`message-${season.id}-${team.id}`}>
                        <textarea
                          className={inputClass}
                          id={`message-${season.id}-${team.id}`}
                          name="message"
                          maxLength={500}
                          rows={2}
                        />
                      </Field>
                      <div className="mt-3" />
                    </RosterActionForm>
                  )),
              )}
            </div>
          </Card>
        ) : null}

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Your join requests</h2>
          {requests.length ? (
            <div className="mt-4 grid gap-3">
              {requests.map((request) => (
                <div
                  className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  key={request.id}
                >
                  <div>
                    <p className="font-medium">{request.team.name}</p>
                    <p className="text-muted text-sm">{request.season.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={request.status === "PENDING" ? "warning" : "neutral"}>
                      {request.status.toLowerCase()}
                    </Badge>
                    {request.status === "PENDING" ? (
                      <RosterActionForm
                        action={cancelJoinRequestAction}
                        submitLabel="Cancel"
                        variant="danger"
                      >
                        <input type="hidden" name="requestId" value={request.id} />
                      </RosterActionForm>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-3 text-sm">No join requests yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
