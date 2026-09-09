import { ButtonLink } from "@/components/ui";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-muted text-sm font-semibold tracking-wide uppercase">Error 403</p>
      <h1 className="mt-2 text-3xl font-bold">You don&rsquo;t have access to this area</h1>
      <p className="text-muted mt-4 text-sm">
        You are signed in, but your account isn&rsquo;t in the group required for this section.
        Referee tools need membership of the <code className="font-mono">msslrefs</code>{" "}
        distribution list; Match Control needs the league administrator group or the
        <code className="mx-1 font-mono">MSSL_ADMIN_UPNS</code> allowlist.
      </p>
      <p className="text-muted mt-3 text-sm">
        If you believe this is wrong, check your roles on your account page, then contact the league
        office.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/account">Check my roles</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Back to the league
        </ButtonLink>
      </div>
    </main>
  );
}
