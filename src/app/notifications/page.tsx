import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  broadcastTeamNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/notifications/actions";
import { ActionForm, SubmitButton } from "@/components/admin-forms";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  inputClass,
} from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import { formatDate } from "@/lib/dates";
import {
  isSafeInternalHref,
  listNotifications,
  MAX_NOTIFICATION_BODY_LENGTH,
  MAX_NOTIFICATION_TITLE_LENGTH,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/notifications");

  const notifications = await listNotifications(prisma, user.appUserId);
  const captainContexts = user.teamContexts.filter((context) => context.role === "captain");
  const contextKeys = new Set(
    captainContexts.map((context) => `${context.seasonId}:${context.teamId}`),
  );
  const captainTeams = captainContexts.length
    ? await prisma.teamCaptain.findMany({
        where: {
          userId: user.appUserId,
          status: "ACTIVE",
          revokedAt: null,
          seasonId: { not: null },
        },
        select: {
          seasonId: true,
          teamId: true,
          team: { select: { name: true, slug: true } },
          season: { select: { name: true, slug: true } },
        },
        orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
      })
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        description="Updates sent to your MSSL account. Messages are never shared with another recipient."
        actions={
          <ButtonLink href="/calendar.ics" variant="secondary">
            Download my calendar
          </ButtonLink>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-start">
        <section aria-labelledby="notification-list">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="notification-list" className="text-lg font-semibold">
              Inbox
            </h2>
            {notifications.some((notification) => !notification.readAt) ? (
              <ActionForm action={markAllNotificationsReadAction} showSuccess={false}>
                <SubmitButton variant="ghost">Mark all read</SubmitButton>
              </ActionForm>
            ) : null}
          </div>
          {notifications.length ? (
            <ol className="grid gap-3">
              {notifications.map((notification) => {
                const content = (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{notification.title}</h3>
                      {!notification.readAt ? <Badge tone="accent">Unread</Badge> : null}
                    </div>
                    <p className="text-muted mt-2 text-sm whitespace-pre-wrap">
                      {notification.body}
                    </p>
                    <p className="text-muted mt-3 text-xs">{formatDate(notification.createdAt)}</p>
                  </>
                );
                return (
                  <Card as="li" key={notification.id} className="p-5">
                    {notification.href && isSafeInternalHref(notification.href) ? (
                      <Link href={notification.href} className="block hover:opacity-90">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                    {!notification.readAt ? (
                      <ActionForm
                        action={markNotificationReadAction}
                        className="mt-3"
                        showSuccess={false}
                      >
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <SubmitButton variant="secondary">Mark read</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </Card>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              title="No notifications"
              hint="New league and team updates will appear here."
            />
          )}
        </section>

        <aside className="grid gap-4">
          {captainTeams.length ? (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">Message your team</h2>
              <p className="text-muted mt-1 text-sm">
                Send an in-app update to active players and co-captains.
              </p>
              <ActionForm action={broadcastTeamNotificationAction} className="mt-4 grid gap-4">
                <Field label="Team and season" htmlFor="broadcast-team">
                  <select id="broadcast-team" name="context" className={inputClass} required>
                    {captainTeams
                      .filter(
                        (assignment) =>
                          assignment.seasonId &&
                          contextKeys.has(`${assignment.seasonId}:${assignment.teamId}`),
                      )
                      .map((assignment) => (
                        <option
                          key={`${assignment.seasonId}:${assignment.teamId}`}
                          value={`${assignment.seasonId}:${assignment.teamId}`}
                        >
                          {assignment.team.name} - {assignment.season?.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Title" htmlFor="broadcast-title">
                  <input
                    id="broadcast-title"
                    name="title"
                    className={inputClass}
                    maxLength={MAX_NOTIFICATION_TITLE_LENGTH}
                    required
                  />
                </Field>
                <Field label="Message" htmlFor="broadcast-body">
                  <textarea
                    id="broadcast-body"
                    name="body"
                    className={`${inputClass} min-h-28`}
                    maxLength={MAX_NOTIFICATION_BODY_LENGTH}
                    required
                  />
                </Field>
                <Alert tone="info">Messages are in-app only; no e-mail is sent.</Alert>
                <SubmitButton>Send message</SubmitButton>
              </ActionForm>
            </Card>
          ) : null}

          {captainTeams.map((assignment) =>
            assignment.seasonId && assignment.season ? (
              <Card key={`calendar:${assignment.seasonId}:${assignment.teamId}`} className="p-5">
                <h2 className="font-semibold">{assignment.team.name} calendar</h2>
                <p className="text-muted mt-1 text-sm">{assignment.season.name} fixtures</p>
                <a
                  className="text-accent mt-3 inline-block text-sm font-semibold hover:underline"
                  href={`/teams/${assignment.team.slug}/calendar.ics?season=${assignment.season.slug}`}
                >
                  Download team calendar
                </a>
              </Card>
            ) : null,
          )}
        </aside>
      </div>
    </div>
  );
}
