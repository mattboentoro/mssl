/**
 * Thin Microsoft Graph helpers used for role resolution.
 *
 * `msslrefs` is a *distribution list*, so its membership is never emitted in
 * the id/access token `groups` claim. The only reliable way to answer "is this
 * person a referee?" is to ask Graph directly, which is what this module does.
 */

import { config } from "@/lib/config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

async function graphFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return response;
}

/**
 * `POST /me/checkMemberGroups` — returns the subset of `groupIds` that the
 * signed-in user is a member of, transitively. Requires the delegated
 * `GroupMember.Read.All` scope.
 */
export async function checkMemberGroups(
  accessToken: string,
  groupIds: string[],
): Promise<string[]> {
  const ids = groupIds.filter(Boolean);
  if (ids.length === 0) return [];

  const response = await graphFetch(accessToken, "/me/checkMemberGroups", {
    method: "POST",
    body: JSON.stringify({ groupIds: ids }),
  });

  if (!response.ok) {
    throw new GraphError(
      `checkMemberGroups failed: ${response.status} ${await safeText(response)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as { value?: string[] };
  return payload.value ?? [];
}

/** Cache of displayName -> objectId so the fallback lookup happens once. */
const groupIdByName = new Map<string, string | null>();

/**
 * Fallback used when `MSSL_REFS_GROUP_ID` is not configured: resolve the group
 * object id from its display name (e.g. `msslrefs`).
 */
export async function resolveGroupIdByName(
  accessToken: string,
  displayName: string,
): Promise<string | null> {
  const key = displayName.toLowerCase();
  if (groupIdByName.has(key)) return groupIdByName.get(key) ?? null;

  const query = `/groups?$select=id,displayName&$top=1&$filter=${encodeURIComponent(
    `displayName eq '${displayName.replace(/'/g, "''")}'`,
  )}`;

  const response = await graphFetch(accessToken, query);
  if (!response.ok) {
    // Do not cache failures caused by missing consent — they are recoverable.
    throw new GraphError(
      `group lookup failed: ${response.status} ${await safeText(response)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as { value?: { id: string }[] };
  const id = payload.value?.[0]?.id ?? null;
  groupIdByName.set(key, id);
  return id;
}

export interface ResolvedGroups {
  isReferee: boolean;
  isAdmin: boolean;
  /** Group ids the user was confirmed to be a member of. */
  matchedGroupIds: string[];
  /** Populated when Graph could not be reached; roles then fall back to UPN. */
  error?: string;
}

/**
 * Resolve referee/admin membership for the signed-in user.
 *
 * Never throws: a Graph outage degrades the user to `viewer` (plus any UPN
 * allowlist match) instead of breaking sign-in.
 */
export async function resolveGroupMembership(accessToken: string): Promise<ResolvedGroups> {
  try {
    let refsGroupId = config.roles.refsGroupId;
    if (!refsGroupId && config.roles.refsGroupName) {
      refsGroupId = (await resolveGroupIdByName(accessToken, config.roles.refsGroupName)) ?? "";
    }

    const candidates = [refsGroupId, config.roles.adminGroupId].filter(Boolean);
    const matched = await checkMemberGroups(accessToken, candidates);

    return {
      isReferee: Boolean(refsGroupId) && matched.includes(refsGroupId),
      isAdmin: Boolean(config.roles.adminGroupId) && matched.includes(config.roles.adminGroupId),
      matchedGroupIds: matched,
    };
  } catch (error) {
    return {
      isReferee: false,
      isAdmin: false,
      matchedGroupIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** True when the signed-in UPN is on the configured admin allowlist. */
export function isAllowlistedAdmin(upn: string | null | undefined): boolean {
  if (!upn) return false;
  return config.roles.adminUpns.includes(upn.toLowerCase());
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
