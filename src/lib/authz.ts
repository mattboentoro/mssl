import { auth } from "@/auth";
import type { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { loadAuthorization, type TeamContext } from "@/lib/rbac";
import type { Referee } from "@prisma/client";

/**
 * Server-side authorization helpers.
 *
 * Every API route and server action must go through these. Entra proves
 * identity, but role and team state is reloaded from the application database
 * on every call. A database lookup failure yields Viewer only.
 */

export interface SessionUser {
  id: string;
  appUserId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  roles: Role[];
  teamContexts: TeamContext[];
  isPlayer: boolean;
  isCaptain: boolean;
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
  let roles: Role[] = ["viewer"];
  let teamContexts: TeamContext[] = [];
  let roleError = user.roleError;
  if (user.appUserId) {
    try {
      const authorization = await loadAuthorization(prisma, user.appUserId);
      roles = authorization.roles;
      teamContexts = authorization.teamContexts;
    } catch {
      roleError = "Application roles could not be loaded.";
    }
  } else {
    roleError ??= "No application account is linked to this session.";
  }
  return {
    id: user.id,
    appUserId: user.appUserId,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    roles,
    teamContexts,
    isPlayer: roles.includes("player"),
    isCaptain: roles.includes("captain"),
    isReferee: roles.includes("referee"),
    isAdmin: roles.includes("admin"),
    isDevBypass: Boolean(user.isDevBypass),
    roleError,
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

export async function requirePlayer(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlayer) {
    throw new AuthzError("Player access is required.", 403, "FORBIDDEN");
  }
  return user;
}

export async function requireCaptain(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isCaptain) {
    throw new AuthzError("Captain access is required.", 403, "FORBIDDEN");
  }
  return user;
}

export interface CaptainContext {
  user: SessionUser;
  teamId: string;
  seasonId: string;
}

export async function requireCaptainForTeam(
  teamId: string,
  seasonId?: string,
): Promise<CaptainContext> {
  const user = await requireCaptain();
  const context = user.teamContexts.find(
    (candidate) =>
      candidate.role === "captain" &&
      candidate.teamId === teamId &&
      (seasonId === undefined || candidate.seasonId === seasonId),
  );
  if (!context) {
    throw new AuthzError("Captain access for this team and season is required.", 403, "FORBIDDEN");
  }
  return { user, teamId: context.teamId, seasonId: context.seasonId };
}

export async function requireParticipantCaptain(matchId: string): Promise<CaptainContext> {
  const user = await requireCaptain();
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { seasonId: true, homeTeamId: true, awayTeamId: true },
  });
  if (!match) {
    throw new AuthzError("That match does not exist.", 403, "FORBIDDEN");
  }
  const context = user.teamContexts.find(
    (candidate) =>
      candidate.role === "captain" &&
      candidate.seasonId === match.seasonId &&
      (candidate.teamId === match.homeTeamId || candidate.teamId === match.awayTeamId),
  );
  if (!context) {
    throw new AuthzError("A captain of a participating team is required.", 403, "FORBIDDEN");
  }
  return { user, teamId: context.teamId, seasonId: context.seasonId };
}

export interface RefereeContext {
  user: SessionUser;
  referee: Referee;
}

/**
 * Require an explicit database Referee role and an active Referee record.
 */
export async function requireReferee(): Promise<RefereeContext> {
  const user = await requireUser();
  if (!user.isReferee) {
    throw new AuthzError("An explicit Referee role is required.", 403, "FORBIDDEN");
  }

  const referee = await getRefereeForUser(user);
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
  if (!user.appUserId) return null;
  return prisma.referee.findFirst({
    where: { userId: user.appUserId },
  });
}

/** Convenience for pages that want to branch on role without throwing. */
export async function getRoleFlags(): Promise<{
  signedIn: boolean;
  isReferee: boolean;
  isAdmin: boolean;
  isPlayer: boolean;
  isCaptain: boolean;
  user: SessionUser | null;
}> {
  const user = await getCurrentUser();
  return {
    signedIn: Boolean(user),
    isReferee: Boolean(user?.isReferee),
    isAdmin: Boolean(user?.isAdmin),
    isPlayer: Boolean(user?.isPlayer),
    isCaptain: Boolean(user?.isCaptain),
    user,
  };
}
