import { redirect } from "next/navigation";

import { getRoleFlags } from "@/lib/authz";

/**
 * Post sign-in landing.
 *
 * Sign-in has to pick a `redirectTo` *before* the session exists, so it cannot
 * branch on role. It sends everyone here instead and this page forwards to the
 * console that matches the role the session actually resolved to. An explicit
 * `?callbackUrl=` on /signin bypasses this, so "sign in to reach the page you
 * were blocked from" still works.
 */
export const dynamic = "force-dynamic";

export default async function AfterSignInPage() {
  const { signedIn, isAdmin, isReferee, isCaptain, isPlayer } = await getRoleFlags();

  if (!signedIn) redirect("/signin");
  if (isAdmin) redirect("/admin");
  if (isReferee) redirect("/referee");
  if (isCaptain) redirect("/captain");
  if (isPlayer) redirect("/player");
  redirect("/");
}
