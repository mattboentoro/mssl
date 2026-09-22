import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { getCurrentUser, getRefereeForUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/account");

  const referee = await getRefereeForUser(user);
  const teams =
    user.teamContexts.length > 0
      ? await prisma.team.findMany({
          where: { id: { in: [...new Set(user.teamContexts.map((context) => context.teamId))] } },
          select: { id: true, name: true },
        })
      : [];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Your account"
        description="What the server currently believes about you."
      />

      {user.isDevBypass ? (
        <Alert tone="warning" title="Development session">
          You are signed in through the dev-only bypass. This identity uses the same database role
          assignments and team contexts as a Microsoft sign-in.
        </Alert>
      ) : null}

      {user.roleError ? (
        <div className="mt-4">
          <Alert tone="warning" title="Group membership could not be verified">
            {user.roleError} You have been given read-only access until the database responds.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-6 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Name</dt>
            <dd className="mt-1">{user.name ?? "\u2014"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted text-xs font-semibold uppercase">Team contexts</dt>
            <dd className="mt-1 text-sm">
              {user.teamContexts.length ? (
                <ul className="flex flex-wrap gap-2">
                  {user.teamContexts.map((context) => (
                    <li key={`${context.role}-${context.seasonId}-${context.teamId}`}>
                      <Badge tone="neutral">
                        {context.role}: {teamNames.get(context.teamId) ?? context.teamId}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">None</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Email</dt>
            <dd className="mt-1 font-mono text-sm break-all">{user.email ?? "\u2014"}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Badge
                  key={role}
                  tone={role === "admin" ? "accent" : role === "referee" ? "brand" : "neutral"}
                >
                  {role}
                </Badge>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Referee record</dt>
            <dd className="mt-1 text-sm">
              {referee ? (
                <>
                  {referee.name}
                  {referee.active ? null : <span className="text-danger"> (inactive)</span>}
                </>
              ) : (
                <span className="text-muted">None linked</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          {user.isPlayer ? (
            <Link href="/player" className="text-accent text-sm font-medium hover:underline">
              Go to Player dashboard &rarr;
            </Link>
          ) : null}
          {user.isCaptain ? (
            <Link href="/captain" className="text-accent text-sm font-medium hover:underline">
              Go to Captain dashboard &rarr;
            </Link>
          ) : null}
          {user.isReferee ? (
            <Link href="/referee" className="text-accent text-sm font-medium hover:underline">
              Go to Referee Control &rarr;
            </Link>
          ) : null}
          {user.isAdmin ? (
            <Link href="/admin/matches" className="text-accent text-sm font-medium hover:underline">
              Go to Match Control &rarr;
            </Link>
          ) : null}
        </div>
      </Card>

      <form action={doSignOut} className="mt-6">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
