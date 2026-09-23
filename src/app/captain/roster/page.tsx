import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";

import {
  cancelInvitationAction,
  decideJoinRequestAction,
  demoteCaptainAction,
  invitePlayerAction,
  promoteMemberAction,
  removeMemberAction,
} from "@/app/roster/actions";
import { RosterActionForm } from "@/components/roster-action-form";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Manage roster" };
export const dynamic = "force-dynamic";

export default async function CaptainRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ seasonId?: string; teamId?: string }>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin?callbackUrl=/captain/roster");
  }
  const contexts = user.teamContexts.filter((context) => context.role === "captain");
  if (!user.isAdmin && !contexts.length) forbidden();

  const params = await searchParams;
  const available = user.isAdmin
    ? await prisma.seasonTeam.findMany({
        include: { season: true, team: true },
        orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
      })
    : await prisma.seasonTeam.findMany({
        where: {
          OR: contexts.map(({ seasonId, teamId }) => ({ seasonId, teamId })),
        },
        include: { season: true, team: true },
        orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
      });
  const selected =
    available.find(
      ({ seasonId, teamId }) => seasonId === params.seasonId && teamId === params.teamId,
    ) ?? available[0];

  if (!selected) {
    return (
      <div>
        <PageHeader
          backHref={user.isAdmin ? "/admin/roster" : "/captain"}
          backLabel={user.isAdmin ? "Admin rosters" : "Captain dashboard"}
          title="Manage roster"
          eyebrow={user.isAdmin ? "Admin" : "Captain"}
        />
        <Card className="p-6">
          <EmptyState title="No team-season assignments are available." />
        </Card>
      </div>
    );
  }

  const [memberships, captains, requests, invitations] = await Promise.all([
    prisma.teamMembership.findMany({
      where: {
        seasonId: selected.seasonId,
        teamId: selected.teamId,
        status: "ACTIVE",
        endedAt: null,
      },
      include: { user: true },
      orderBy: { user: { displayName: "asc" } },
    }),
    prisma.teamCaptain.findMany({
      where: {
        seasonId: selected.seasonId,
        teamId: selected.teamId,
        status: "ACTIVE",
        revokedAt: null,
      },
      include: { user: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.rosterJoinRequest.findMany({
      where: {
        seasonId: selected.seasonId,
        teamId: selected.teamId,
        status: "PENDING",
      },
      include: { requester: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rosterInvitation.findMany({
      where: {
        seasonId: selected.seasonId,
        teamId: selected.teamId,
        status: "PENDING",
      },
      include: { invitedBy: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const captainUserIds = new Set(captains.flatMap(({ userId }) => (userId ? [userId] : [])));

  return (
    <div>
      <PageHeader
        backHref={user.isAdmin ? "/admin/roster" : "/captain"}
        backLabel={user.isAdmin ? "Admin rosters" : "Captain dashboard"}
        eyebrow={user.isAdmin ? "Admin fallback" : "Captain"}
        title={`${selected.team.name} roster`}
        description={`${selected.season.name}. Membership changes and role changes are audited.`}
        actions={<ButtonLink href="/roster">My roster</ButtonLink>}
      />

      {available.length > 1 ? (
        <Card className="mb-6 p-4">
          <p className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            Manage another team
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((item) => (
              <ButtonLink
                href={`/captain/roster?seasonId=${item.seasonId}&teamId=${item.teamId}`}
                key={item.id}
                variant={
                  item.seasonId === selected.seasonId && item.teamId === selected.teamId
                    ? "primary"
                    : "secondary"
                }
              >
                {item.team.name} · {item.season.name}
              </ButtonLink>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Invite a player</h2>
          <p className="text-muted mt-1 text-sm">
            Enter the e-mail address of someone who does not have an MSSL account yet. Existing
            users should submit a join request from their roster page.
          </p>
          <RosterActionForm
            action={invitePlayerAction}
            className="mt-4 grid gap-4 md:grid-cols-2"
            submitLabel="Send invitation"
          >
            <input type="hidden" name="seasonId" value={selected.seasonId} />
            <input type="hidden" name="teamId" value={selected.teamId} />
            <Field label="E-mail" htmlFor="email">
              <input className={inputClass} id="email" name="email" required type="email" />
            </Field>
            <Field label="Message (optional)" htmlFor="message">
              <textarea
                className={inputClass}
                id="message"
                name="message"
                maxLength={500}
                rows={2}
              />
            </Field>
          </RosterActionForm>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Join requests</h2>
          {requests.length ? (
            <div className="mt-4 grid gap-3">
              {requests.map((request) => (
                <div className="border-subtle rounded-lg border p-4" key={request.id}>
                  <p className="font-medium">{request.requester.displayName}</p>
                  <p className="text-muted text-sm">{request.requester.email}</p>
                  {request.message ? <p className="mt-2 text-sm">{request.message}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <RosterActionForm
                      action={decideJoinRequestAction}
                      submitLabel="Approve"
                      variant="success"
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="ACCEPTED" />
                    </RosterActionForm>
                    <RosterActionForm
                      action={decideJoinRequestAction}
                      submitLabel="Reject"
                      variant="danger"
                    >
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                    </RosterActionForm>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-3 text-sm">No pending join requests.</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Active roster</h2>
          {memberships.length ? (
            <div className="mt-4 grid gap-3">
              {memberships.map((membership) => {
                const isCaptain = captainUserIds.has(membership.userId);
                return (
                  <div
                    className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                    key={membership.id}
                  >
                    <div>
                      <p className="font-medium">{membership.user.displayName}</p>
                      <p className="text-muted text-sm">{membership.user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isCaptain ? <Badge tone="brand">captain</Badge> : <Badge>player</Badge>}
                      {!isCaptain ? (
                        <RosterActionForm
                          action={promoteMemberAction}
                          submitLabel="Promote"
                          variant="secondary"
                        >
                          <input type="hidden" name="membershipId" value={membership.id} />
                        </RosterActionForm>
                      ) : null}
                      <RosterActionForm
                        action={removeMemberAction}
                        submitLabel="Remove"
                        variant="danger"
                      >
                        <input type="hidden" name="membershipId" value={membership.id} />
                      </RosterActionForm>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted mt-3 text-sm">This team has no active players.</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Captains</h2>
          {captains.length ? (
            <div className="mt-4 grid gap-3">
              {captains.map((captain) => (
                <div
                  className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  key={captain.id}
                >
                  <div>
                    <p className="font-medium">{captain.user?.displayName ?? captain.name}</p>
                    <p className="text-muted text-sm">{captain.email}</p>
                  </div>
                  <RosterActionForm
                    action={demoteCaptainAction}
                    submitLabel="Demote"
                    variant="danger"
                  >
                    <input type="hidden" name="captainId" value={captain.id} />
                  </RosterActionForm>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="This team is Captainless."
              hint="An administrator can promote an active roster member."
            />
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Open invitations</h2>
          {invitations.length ? (
            <div className="mt-4 grid gap-3">
              {invitations.map((invitation) => (
                <div
                  className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                  key={invitation.id}
                >
                  <div>
                    <p className="font-medium">{invitation.email}</p>
                    <p className="text-muted text-sm">Sent by {invitation.invitedBy.displayName}</p>
                  </div>
                  {(invitation.invitedById === user.appUserId || user.isAdmin) && (
                    <RosterActionForm
                      action={cancelInvitationAction}
                      submitLabel="Cancel"
                      variant="danger"
                    >
                      <input type="hidden" name="invitationId" value={invitation.id} />
                    </RosterActionForm>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-3 text-sm">No open invitations.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
