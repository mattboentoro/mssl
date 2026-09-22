import { Prisma, type AppUser, type PrismaClient } from "@prisma/client";

import { config } from "@/lib/config";
import type { AssignableRole, Role } from "@/lib/enums";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export class IdentityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityConflictError";
  }
}

export class RoleMutationError extends Error {
  constructor(
    message: string,
    readonly code: "USER_NOT_FOUND" | "BOOTSTRAP_ADMIN" | "LAST_ADMIN" | "CONFLICT",
  ) {
    super(message);
    this.name = "RoleMutationError";
  }
}

export interface IdentityInput {
  entraObjectId: string;
  email: string;
  displayName: string;
}

/** Create an e-mail-only identity solely for a pending Captain/roster link. */
export async function ensureProvisionalIdentity(
  db: DbClient,
  input: { email: string; displayName: string },
): Promise<AppUser> {
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await db.appUser.findUnique({ where: { normalizedEmail } });
  if (existing) return existing;
  return db.appUser.create({
    data: {
      email: input.email.trim(),
      normalizedEmail,
      displayName: input.displayName.trim() || input.email.trim(),
      status: "PROVISIONAL",
    },
  });
}

/**
 * Claim an application account using the immutable Entra object id. An e-mail
 * match is accepted only for an explicitly provisional account created by a
 * pending invitation or legacy captain record.
 */
export async function claimApplicationIdentity(
  db: DbClient,
  input: IdentityInput,
): Promise<AppUser> {
  const entraObjectId = input.entraObjectId.trim();
  const normalizedEmail = normalizeEmail(input.email);
  if (!entraObjectId || !normalizedEmail) {
    throw new IdentityConflictError("A stable Entra object id and e-mail are required.");
  }

  return claimInTransaction(db, { ...input, entraObjectId, normalizedEmail });
}

async function claimInTransaction(
  db: DbClient,
  input: IdentityInput & { normalizedEmail: string },
): Promise<AppUser> {
  // PrismaClient has $transaction; a transaction client deliberately does not.
  if ("$transaction" in db) {
    return db.$transaction((tx) => claimIdentityRows(tx, input));
  }
  return claimIdentityRows(db, input);
}

async function claimIdentityRows(
  db: DbClient,
  input: IdentityInput & { normalizedEmail: string },
): Promise<AppUser> {
  const byObjectId = await db.appUser.findUnique({
    where: { entraObjectId: input.entraObjectId },
  });

  let user: AppUser;
  if (byObjectId) {
    user = await db.appUser.update({
      where: { id: byObjectId.id },
      data: {
        email: input.email.trim(),
        normalizedEmail: input.normalizedEmail,
        displayName: input.displayName.trim() || input.email.trim(),
        status: "ACTIVE",
        claimedAt: byObjectId.claimedAt ?? new Date(),
        lastSignInAt: new Date(),
      },
    });
  } else {
    const byEmail = await db.appUser.findUnique({
      where: { normalizedEmail: input.normalizedEmail },
    });
    if (byEmail?.entraObjectId && byEmail.entraObjectId !== input.entraObjectId) {
      throw new IdentityConflictError("That e-mail is already linked to another Entra identity.");
    }
    if (byEmail && byEmail.status !== "PROVISIONAL") {
      throw new IdentityConflictError("Only a provisional identity may be claimed by e-mail.");
    }

    user = byEmail
      ? await db.appUser.update({
          where: { id: byEmail.id },
          data: {
            entraObjectId: input.entraObjectId,
            email: input.email.trim(),
            displayName: input.displayName.trim() || input.email.trim(),
            status: "ACTIVE",
            claimedAt: new Date(),
            lastSignInAt: new Date(),
          },
        })
      : await db.appUser.create({
          data: {
            entraObjectId: input.entraObjectId,
            email: input.email.trim(),
            normalizedEmail: input.normalizedEmail,
            displayName: input.displayName.trim() || input.email.trim(),
            status: "ACTIVE",
            claimedAt: new Date(),
            lastSignInAt: new Date(),
          },
        });
  }

  await Promise.all([
    db.teamCaptain.updateMany({
      where: {
        normalizedEmail: input.normalizedEmail,
        seasonId: { not: null },
        status: "PENDING",
        OR: [{ userId: null }, { userId: user.id }],
      },
      data: { userId: user.id, status: "ACTIVE", activatedAt: new Date() },
    }),
    db.rosterInvitation.updateMany({
      where: { invitedUserId: null, normalizedEmail: input.normalizedEmail, status: "PENDING" },
      data: { invitedUserId: user.id },
    }),
    db.referee.updateMany({
      where: { userId: null, email: input.normalizedEmail },
      data: { userId: user.id, entraObjectId: input.entraObjectId },
    }),
  ]);

  if (config.roles.bootstrapAdminObjectIds.includes(input.entraObjectId)) {
    await db.globalRoleAssignment.upsert({
      where: { userId_role: { userId: user.id, role: "ADMIN" } },
      create: { userId: user.id, role: "ADMIN" },
      update: {},
    });
  }
  return user;
}

export interface TeamContext {
  seasonId: string;
  teamId: string;
  role: "player" | "captain";
}

export interface AuthorizationSnapshot {
  roles: Role[];
  teamContexts: TeamContext[];
}

export async function loadAuthorization(
  db: DbClient,
  userId: string,
): Promise<AuthorizationSnapshot> {
  const user = await db.appUser.findUnique({
    where: { id: userId },
    select: {
      status: true,
      rolesAssigned: { where: { revokedAt: null }, select: { role: true } },
      memberships: {
        where: { status: "ACTIVE", endedAt: null },
        select: { seasonId: true, teamId: true },
      },
      captainAssignments: {
        where: { status: "ACTIVE", revokedAt: null, seasonId: { not: null } },
        select: { seasonId: true, teamId: true },
      },
    },
  });
  if (!user || user.status !== "ACTIVE") return { roles: ["viewer"], teamContexts: [] };

  const roles = new Set<Role>(["viewer"]);
  for (const assignment of user.rolesAssigned) {
    const role = assignment.role.toLowerCase();
    if (role === "admin" || role === "referee" || role === "captain" || role === "player") {
      roles.add(role);
    }
  }
  if (user.memberships.length) roles.add("player");
  if (user.captainAssignments.length) roles.add("captain");

  return {
    roles: [...roles],
    teamContexts: [
      ...user.memberships.map((membership) => ({
        ...membership,
        role: "player" as const,
      })),
      ...user.captainAssignments.map((captain) => ({
        seasonId: captain.seasonId as string,
        teamId: captain.teamId,
        role: "captain" as const,
      })),
    ],
  };
}

export async function assignGlobalRole(
  db: DbClient,
  input: { userId: string; role: AssignableRole; actorId: string },
) {
  const assignment = await db.globalRoleAssignment.upsert({
    where: { userId_role: { userId: input.userId, role: input.role } },
    create: { userId: input.userId, role: input.role, assignedById: input.actorId },
    update: {
      assignedById: input.actorId,
      assignedAt: new Date(),
      revokedById: null,
      revokedAt: null,
    },
  });
  if (input.role === "REFEREE") {
    const user = await db.appUser.findUniqueOrThrow({ where: { id: input.userId } });
    const referee = await db.referee.findUnique({ where: { email: user.normalizedEmail } });
    if (referee) {
      await db.referee.update({
        where: { id: referee.id },
        data: { userId: user.id, entraObjectId: user.entraObjectId },
      });
    } else {
      await db.referee.create({
        data: {
          name: user.displayName,
          email: user.normalizedEmail,
          userId: user.id,
          entraObjectId: user.entraObjectId,
        },
      });
    }
  }
  return assignment;
}

export async function revokeGlobalRole(
  db: DbClient,
  input: { userId: string; role: AssignableRole; actorId?: string },
): Promise<boolean> {
  if ("$transaction" in db) {
    return withSerializedRoleMutation(db, (tx) => revokeGlobalRole(tx, input));
  }
  const subject = await db.appUser.findUnique({
    where: { id: input.userId },
    select: { entraObjectId: true },
  });
  if (!subject) throw new RoleMutationError("That user no longer exists.", "USER_NOT_FOUND");
  if (
    input.role === "ADMIN" &&
    subject.entraObjectId &&
    config.roles.bootstrapAdminObjectIds.includes(subject.entraObjectId)
  ) {
    throw new RoleMutationError(
      "This bootstrap administrator is configured by the environment and cannot be removed here.",
      "BOOTSTRAP_ADMIN",
    );
  }
  if (input.role === "ADMIN") {
    await db.authorizationInvariant.upsert({
      where: { id: "active-admin" },
      create: { id: "active-admin", version: 1 },
      update: { version: { increment: 1 } },
    });
    const activeAdmins = await db.globalRoleAssignment.count({
      where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
    });
    const subjectIsActiveAdmin = await db.globalRoleAssignment.count({
      where: {
        userId: input.userId,
        role: "ADMIN",
        revokedAt: null,
        user: { status: "ACTIVE" },
      },
    });
    if (subjectIsActiveAdmin && activeAdmins <= 1) {
      throw new RoleMutationError(
        "The league must retain at least one active administrator.",
        "LAST_ADMIN",
      );
    }
  }
  const result = await db.globalRoleAssignment.updateMany({
    where: { userId: input.userId, role: input.role, revokedAt: null },
    data: { revokedAt: new Date(), revokedById: input.actorId },
  });
  return result.count > 0;
}

const SERIALIZATION_RETRIES = 3;

export async function withSerializedRoleMutation<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof RoleMutationError) throw error;
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P1008" || error.code === "P2034");
      if (!retryable) throw error;
      if (attempt + 1 === SERIALIZATION_RETRIES) {
        throw new RoleMutationError(
          "Another administrator change won the race. Refresh and try again.",
          "CONFLICT",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new RoleMutationError(
    "Another administrator change won the race. Refresh and try again.",
    "CONFLICT",
  );
}

export async function setActiveTeamMembership(
  db: DbClient,
  input: { seasonId: string; teamId: string; userId: string; actorId?: string },
) {
  return db.teamMembership.upsert({
    where: { seasonId_userId: { seasonId: input.seasonId, userId: input.userId } },
    create: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      userId: input.userId,
      assignedById: input.actorId,
    },
    update: {
      teamId: input.teamId,
      status: "ACTIVE",
      endedAt: null,
      joinedAt: new Date(),
      assignedById: input.actorId,
    },
  });
}
