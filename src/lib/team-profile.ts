import "server-only";

import { writeAudit, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  generateTeamLogoBlobName,
  type StoredTeamLogo,
  type TeamLogoStorage,
} from "@/lib/team-logo-storage";

export interface TeamProfileInput {
  name: string;
  shortName: string;
  colorPrimary: string;
  colorAlternate: string;
}

export interface TeamLogoPointer {
  blobName: string;
  container: string;
  contentType: string;
  etag: string | null;
}

export interface TeamLogoPersistence {
  commitReplacement(
    teamId: string,
    logo: StoredTeamLogo,
    actor: AuditActor,
  ): Promise<TeamLogoPointer | null>;
  commitDeletion(teamId: string, actor: AuditActor): Promise<TeamLogoPointer | null>;
}

export async function updateTeamProfile(
  teamId: string,
  input: TeamProfileInput,
  actor: AuditActor,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.team.findUnique({ where: { id: teamId } });
    if (!before) throw new Error("That team no longer exists.");
    await tx.team.update({ where: { id: teamId }, data: input });
    await writeAudit(tx, {
      actor,
      action: "team.profile.update",
      entity: "Team",
      entityId: teamId,
      metadata: {
        before: {
          name: before.name,
          shortName: before.shortName,
          colorPrimary: before.colorPrimary,
          colorAlternate: before.colorAlternate,
        },
        after: input,
      },
    });
  });
}

export async function replaceTeamLogo(options: {
  teamId: string;
  bytes: Uint8Array;
  contentType: StoredTeamLogo["contentType"];
  actor: AuditActor;
  storage: TeamLogoStorage;
  persistence?: TeamLogoPersistence;
  randomId?: () => string;
}): Promise<void> {
  const persistence = options.persistence ?? prismaTeamLogoPersistence;
  const blobName = generateTeamLogoBlobName(options.contentType, options.randomId);
  const uploaded = await options.storage.upload(blobName, options.bytes, options.contentType);

  let oldLogo: TeamLogoPointer | null;
  try {
    oldLogo = await persistence.commitReplacement(options.teamId, uploaded, options.actor);
  } catch (error) {
    try {
      await options.storage.delete(uploaded.blobName);
    } catch (cleanupError) {
      throw new Error(
        `The team logo could not be saved, and cleanup of the new blob also failed: ${errorMessage(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }

  if (oldLogo?.blobName && oldLogo.blobName !== uploaded.blobName) {
    try {
      await options.storage.delete(oldLogo.blobName);
    } catch (error) {
      throw new Error(
        `The new logo was saved, but the previous blob could not be deleted: ${errorMessage(error)}`,
      );
    }
  }
}

export async function deleteTeamLogo(options: {
  teamId: string;
  actor: AuditActor;
  storage: TeamLogoStorage;
  persistence?: TeamLogoPersistence;
}): Promise<void> {
  const oldLogo = await (options.persistence ?? prismaTeamLogoPersistence).commitDeletion(
    options.teamId,
    options.actor,
  );
  if (!oldLogo?.blobName) return;
  try {
    await options.storage.delete(oldLogo.blobName);
  } catch (error) {
    throw new Error(
      `The logo was removed from the team, but its blob could not be deleted: ${errorMessage(error)}`,
    );
  }
}

function pointer(team: {
  logoBlobName: string | null;
  logoContainer: string | null;
  logoContentType: string | null;
  logoEtag: string | null;
}): TeamLogoPointer | null {
  if (!team.logoBlobName || !team.logoContainer || !team.logoContentType) return null;
  return {
    blobName: team.logoBlobName,
    container: team.logoContainer,
    contentType: team.logoContentType,
    etag: team.logoEtag,
  };
}

const prismaTeamLogoPersistence: TeamLogoPersistence = {
  async commitReplacement(teamId, logo, actor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.team.findUnique({ where: { id: teamId } });
      if (!before) throw new Error("That team no longer exists.");
      await tx.team.update({
        where: { id: teamId },
        data: {
          logoBlobName: logo.blobName,
          logoContainer: logo.container,
          logoContentType: logo.contentType,
          logoEtag: logo.etag,
          logoUpdatedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actor,
        action: "team.logo.replace",
        entity: "Team",
        entityId: teamId,
        metadata: { before: pointer(before), after: logo },
      });
      return pointer(before);
    });
  },
  async commitDeletion(teamId, actor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.team.findUnique({ where: { id: teamId } });
      if (!before) throw new Error("That team no longer exists.");
      const oldLogo = pointer(before);
      await tx.team.update({
        where: { id: teamId },
        data: {
          logoBlobName: null,
          logoContainer: null,
          logoContentType: null,
          logoEtag: null,
          logoUpdatedAt: null,
        },
      });
      await writeAudit(tx, {
        actor,
        action: "team.logo.delete",
        entity: "Team",
        entityId: teamId,
        metadata: { before: oldLogo },
      });
      return oldLogo;
    });
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown storage error";
}
