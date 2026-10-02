import type { PrismaClient } from "@prisma/client";

import { FREE_AGENT_STATUSES, type FreeAgentStatus } from "@/lib/enums";

export interface FreeAgentPoolFilters {
  status?: FreeAgentStatus;
  divisionId?: string;
}

export type FreeAgentPoolEntry = Awaited<ReturnType<typeof listAvailableFreeAgents>>[number];

export async function listAvailableFreeAgents(
  db: PrismaClient,
  filters: FreeAgentPoolFilters = {},
) {
  const requests = await db.freeAgentRequest.findMany({
    where: {
      status: { in: [...FREE_AGENT_STATUSES] },
      ...(filters.divisionId ? { preferredDivisionId: filters.divisionId } : {}),
    },
    include: {
      preferredDivision: { select: { name: true } },
      invitations: {
        include: {
          team: { select: { id: true, name: true } },
          season: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const emails = [
    ...new Set(requests.map(({ submittedByEmail }) => submittedByEmail.toLowerCase())),
  ];
  const rosteredUsers = emails.length
    ? await db.appUser.findMany({
        where: {
          normalizedEmail: { in: emails },
          status: "ACTIVE",
          OR: [
            { memberships: { some: { status: "ACTIVE", endedAt: null } } },
            { captainAssignments: { some: { status: "ACTIVE", revokedAt: null } } },
          ],
        },
        select: { normalizedEmail: true },
      })
    : [];
  const rosteredEmails = new Set(rosteredUsers.map(({ normalizedEmail }) => normalizedEmail));

  return requests
    .filter(({ submittedByEmail }) => !rosteredEmails.has(submittedByEmail.toLowerCase()))
    .map((request) => ({
      ...request,
      systemStatus: (request.invitations.length ? "CONTACTED" : "PENDING") as FreeAgentStatus,
    }))
    .filter(({ systemStatus }) => !filters.status || systemStatus === filters.status);
}
