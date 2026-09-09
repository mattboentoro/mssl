import type { Prisma, PrismaClient } from "@prisma/client";

/** Anything that can run a query: the client or a transaction client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  entity: string;
  entityId: string;
  metadata?: unknown;
}

/**
 * Append an audit row. `metadata` is JSON-encoded into a text column so the
 * schema stays portable between SQLite and PostgreSQL.
 */
export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actor.id ?? null,
      actorEmail: entry.actor.email ?? null,
      actorName: entry.actor.name ?? null,
      actorRole: entry.actor.role ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata === undefined ? null : safeStringify(entry.metadata),
    },
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "metadata could not be serialised" });
  }
}

export function parseAuditMetadata(metadata: string | null): unknown {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return metadata;
  }
}
