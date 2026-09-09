import type { Metadata } from "next";
import Link from "next/link";

import { DEV_BYPASS_IDENTITIES, authProviderStatus, signIn } from "@/auth";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const PERSONA_COPY: Record<
  keyof typeof DEV_BYPASS_IDENTITIES,
  { blurb: string; badge: string; tone: "brand" | "accent" | "neutral" }
> = {
  referee: {
    blurb: "Claim open matches, lock them and file game reports.",
    badge: "Referee",
    tone: "brand",
  },
  referee2: {
    blurb: "A second referee — use two browsers to test the assignment race.",
    badge: "Referee",
    tone: "brand",
  },
  admin: {
    blurb: "Everything a referee can do, plus Match Control and the audit log.",
    badge: "Admin",
    tone: "accent",
  },
  viewer: {
    blurb: "A signed-in Microsoft employee with read-only access.",
    badge: "Viewer",
    tone: "neutral",
  },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  const user = await getCurrentUser();

  async function entraSignIn() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  async function devSignIn(formData: FormData) {
    "use server";
    const persona = String(formData.get("persona") ?? "");
    await signIn("dev-bypass", { persona, redirectTo: callbackUrl });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="MSSL"
        title="Sign in"
        description="Referees and league admins sign in with their Microsoft work account. Everything else on this site is public."
      />

      {user ? (
        <Alert tone="success" title={`Signed in as ${user.name ?? user.email}`}>
          <Link href="/account" className="underline">
            Manage your session
          </Link>
          .
        </Alert>
      ) : null}

      {params.error ? (
        <div className="mt-4">
          <Alert title="Sign-in failed">
            {params.error === "CredentialsSignin"
              ? "That development persona is not available."
              : `Provider reported: ${params.error}`}
          </Alert>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <Card className="p-6">
          <h2 className="font-semibold">Microsoft Entra ID</h2>
          <p className="text-muted mt-1 text-sm">
            Uses your Microsoft work account. Referee access is granted by membership of the{" "}
            <code className="font-mono">msslrefs</code> distribution list, checked live against
            Microsoft Graph on every sign-in.
          </p>
          {authProviderStatus.entraConfigured ? (
            <form action={entraSignIn} className="mt-4">
              <Button type="submit">Continue with Microsoft</Button>
            </form>
          ) : (
            <div className="mt-4">
              <Alert tone="warning" title="Not configured yet">
                No Entra app registration is set up. Add{" "}
                <code className="font-mono">AUTH_MICROSOFT_ENTRA_ID_ID</code>,{" "}
                <code className="font-mono">AUTH_MICROSOFT_ENTRA_ID_SECRET</code> and{" "}
                <code className="font-mono">AUTH_MICROSOFT_ENTRA_ID_TENANT_ID</code> to{" "}
                <code className="font-mono">.env</code> &mdash; see the README for the exact steps.
              </Alert>
            </div>
          )}
        </Card>

        {authProviderStatus.devBypassEnabled ? (
          <Card className="border-warning/50 p-6">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Development sign-in</h2>
              <Badge tone="warning">Dev only</Badge>
            </div>
            <p className="text-muted mt-1 text-sm">
              <code className="font-mono">DEV_AUTH_BYPASS</code> is on, so you can impersonate a
              persona without any Azure setup. This provider is not registered at all when{" "}
              <code className="font-mono">NODE_ENV=production</code>.
            </p>
            <ul className="mt-4 grid gap-3">
              {(Object.keys(DEV_BYPASS_IDENTITIES) as (keyof typeof DEV_BYPASS_IDENTITIES)[]).map(
                (persona) => {
                  const identity = DEV_BYPASS_IDENTITIES[persona];
                  const copy = PERSONA_COPY[persona];
                  return (
                    <li
                      key={persona}
                      className="border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{identity.name}</p>
                          <Badge tone={copy.tone}>{copy.badge}</Badge>
                        </div>
                        <p className="text-muted text-xs">{copy.blurb}</p>
                        <p className="text-muted font-mono text-[10px]">{identity.email}</p>
                      </div>
                      <form action={devSignIn}>
                        <input type="hidden" name="persona" value={persona} />
                        <Button type="submit" variant="secondary">
                          Sign in
                        </Button>
                      </form>
                    </li>
                  );
                },
              )}
            </ul>
          </Card>
        ) : (
          <Card className="p-6">
            <h2 className="font-semibold">Development sign-in</h2>
            <p className="text-muted mt-1 text-sm">
              Disabled. Set <code className="font-mono">DEV_AUTH_BYPASS=true</code> in{" "}
              <code className="font-mono">.env</code> to enable it locally.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
