import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { getCurrentUser, getRefereeForUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/account");

  const referee = await getRefereeForUser(user);

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
          You are signed in through the dev-only bypass. Roles come from a hard-coded persona, not
          from Microsoft Graph.
        </Alert>
      ) : null}

      {user.roleError ? (
        <div className="mt-4">
          <Alert tone="warning" title="Group membership could not be verified">
            {user.roleError} You have been given read-only access until Graph responds.
          </Alert>
        </div>
      ) : null}

      <Card className="mt-6 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs font-semibold uppercase">Name</dt>
            <dd className="mt-1">{user.name ?? "\u2014"}</dd>
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
          {user.isReferee || user.isAdmin ? (
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
