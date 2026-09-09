import { auth } from "@/auth";
import type { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import type { Referee } from "@prisma/client";

/**
 * Server-side authorization helpers.
 *
 * Every API route and server action must go through these. Role state that
 * arrives from the browser is never trusted — the session is re-read from the
 * signed JWT on each call, and the JWT callback re-resolves Microsoft Graph
 * group membership whenever the cached decision is older than
 * `ROLE_CACHE_TTL_MS`, so privileged actions cannot ride a stale role forever.
 */

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  roles: Role[];
  isReferee: boolean;
  isAdmin: boolean;
  isDevBypass: boolean;
  roleError?: string;
}

export class AuthzError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user;
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    roles: user.roles ?? ["viewer"],
    isReferee: Boolean(user.isReferee),
    isAdmin: Boolean(user.isAdmin),
    isDevBypass: Boolean(user.isDevBypass),
    roleError: user.roleError,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthzError("You must sign in with your Microsoft account.", 401, "UNAUTHENTICATED");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new AuthzError("Administrator access is required.", 403, "FORBIDDEN");
  }
  return user;
}

export interface RefereeContext {
  user: SessionUser;
  referee: Referee;
}

/**
 * Require `msslrefs` membership *and* an active Referee record.
 *
 * The Referee row is matched on Entra object id first, then e-mail. In dev
 * bypass mode a row is created on demand so the flow is exercisable with no
 * Azure setup at all.
 */
export async function requireReferee(): Promise<RefereeContext> {
  const user = await requireUser();
  if (!user.isReferee && !user.isAdmin) {
    throw new AuthzError(
      "You must be a member of the msslrefs distribution list to do this.",
      403,
      "FORBIDDEN",
    );
  }

  const referee = await getOrCreateRefereeForUser(user);
  if (!referee) {
    throw new AuthzError(
      "No active referee record is linked to your account. Contact the league admin.",
      403,
      "FORBIDDEN",
    );
  }
  if (!referee.active) {
    throw new AuthzError("Your referee record is inactive.", 403, "FORBIDDEN");
  }

  return { user, referee };
}

export async function getRefereeForUser(user: SessionUser): Promise<Referee | null> {
  if (!user.email && !user.id) return null;
  return prisma.referee.findFirst({
    where: {
      OR: [
        ...(user.id ? [{ entraObjectId: user.id }] : []),
        ...(user.email ? [{ email: user.email.toLowerCase() }] : []),
      ],
    },
  });
}

async function getOrCreateRefereeForUser(user: SessionUser): Promise<Referee | null> {
  const existing = await getRefereeForUser(user);
  if (existing) {
    // Backfill the Entra object id the first time a known referee signs in.
    if (!existing.entraObjectId && user.id && !user.isDevBypass) {
      return prisma.referee.update({
        where: { id: existing.id },
        data: { entraObjectId: user.id },
      });
    }
    return existing;
  }

  if (!user.email) return null;

  // Auto-provision: the person is already vouched for by msslrefs membership
  // (or by the dev bypass), so a missing local row should not block them.
  return prisma.referee.create({
    data: {
      name: user.name ?? user.email,
      email: user.email.toLowerCase(),
      entraObjectId: user.isDevBypass ? null : (user.id ?? null),
      active: true,
    },
  });
}

/** Convenience for pages that want to branch on role without throwing. */
export async function getRoleFlags(): Promise<{
  signedIn: boolean;
  isReferee: boolean;
  isAdmin: boolean;
  user: SessionUser | null;
}> {
  const user = await getCurrentUser();
  return {
    signedIn: Boolean(user),
    isReferee: Boolean(user?.isReferee),
    isAdmin: Boolean(user?.isAdmin),
    user,
  };
}
