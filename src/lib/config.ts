/**
 * Central, typed access to environment configuration.
 *
 * Anything that reads `process.env` outside of this module is a bug: keeping it
 * in one place makes the security-sensitive flags (notably `DEV_AUTH_BYPASS`)
 * auditable.
 */

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const idList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const parseForfeitScore = (value: string | undefined): { winner: number; loser: number } => {
  const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(value ?? "");
  if (!match) return { winner: 3, loser: 0 };
  return { winner: Number(match[1]), loser: Number(match[2]) };
};

export const isProduction = process.env.NODE_ENV === "production";

export const config = {
  isProduction,

  /**
   * Dev-only auth bypass. Enabled with DEV_AUTH_BYPASS=true and *hard disabled*
   * in production regardless of the env var, so a mis-set variable in Azure can
   * never open the site up.
   */
  devAuthBypass: !isProduction && bool(process.env.DEV_AUTH_BYPASS, false),

  entra: {
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
    tenantId: process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ?? "common",
  },

  roles: {
    bootstrapAdminObjectIds: idList(process.env.MSSL_BOOTSTRAP_ADMIN_OBJECT_IDS),
  },

  standings: {
    includeUnconfirmed: bool(process.env.STANDINGS_INCLUDE_UNCONFIRMED, true),
    forfeit: parseForfeitScore(process.env.STANDINGS_FORFEIT_SCORE),
  },
} as const;

/** True when a real Entra app registration is configured. */
export const hasEntraConfig = (): boolean =>
  Boolean(config.entra.clientId && config.entra.clientSecret);
