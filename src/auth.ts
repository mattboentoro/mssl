import NextAuth, { type DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { ROLE_CACHE_TTL_MS, config, hasEntraConfig } from "@/lib/config";
import type { Role } from "@/lib/enums";
import { isAllowlistedAdmin, resolveGroupMembership } from "@/lib/graph";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: Role[];
      isReferee: boolean;
      isAdmin: boolean;
      /** True when the session came from the dev-only bypass provider. */
      isDevBypass: boolean;
      /** Set when Graph could not be reached during role resolution. */
      roleError?: string;
    } & DefaultSession["user"];
  }

  interface User {
    roles?: Role[];
    isDevBypass?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    accessToken?: string;
    roles?: Role[];
    rolesCheckedAt?: number;
    isDevBypass?: boolean;
    roleError?: string;
  }
}

export const DEV_BYPASS_IDENTITIES = {
  referee: {
    id: "dev-referee",
    name: "Riley Whistle (dev referee)",
    email: "riley.whistle@example.com",
    roles: ["viewer", "referee"] as Role[],
  },
  referee2: {
    id: "dev-referee-2",
    name: "Sam Sideline (dev referee)",
    email: "sam.sideline@example.com",
    roles: ["viewer", "referee"] as Role[],
  },
  admin: {
    id: "dev-admin",
    name: "Alex Board (dev admin)",
    email: "alex.board@example.com",
    roles: ["viewer", "referee", "admin"] as Role[],
  },
  viewer: {
    id: "dev-viewer",
    name: "Casey Fan (dev viewer)",
    email: "casey.fan@example.com",
    roles: ["viewer"] as Role[],
  },
  // A player has no privileges beyond a viewer's: the free-agent form is open
  // to anyone signed in. The persona exists so the flow can be exercised as
  // somebody who is not already a referee or an administrator.
  player: {
    id: "dev-player",
    name: "Jordan Striker (dev player)",
    email: "jordan.striker@example.com",
    roles: ["viewer"] as Role[],
  },
} as const;

export type DevBypassPersona = keyof typeof DEV_BYPASS_IDENTITIES;

const providers = [];

if (hasEntraConfig()) {
  providers.push(
    MicrosoftEntraID({
      clientId: config.entra.clientId,
      clientSecret: config.entra.clientSecret,
      issuer: `https://login.microsoftonline.com/${config.entra.tenantId}/v2.0`,
      authorization: {
        params: {
          scope: "openid profile email offline_access User.Read GroupMember.Read.All",
        },
      },
    }),
  );
}

if (config.devAuthBypass) {
  providers.push(
    Credentials({
      id: "dev-bypass",
      name: "Development sign-in",
      credentials: {
        persona: { label: "Persona", type: "text" },
      },
      async authorize(raw) {
        // Belt and braces: this provider is only registered when the bypass is
        // enabled, and `config.devAuthBypass` is forced false in production.
        if (!config.devAuthBypass) return null;

        const persona = String(raw?.persona ?? "") as DevBypassPersona;
        const identity = DEV_BYPASS_IDENTITIES[persona];
        if (!identity) return null;

        return {
          id: identity.id,
          name: identity.name,
          email: identity.email,
          roles: [...identity.roles],
          isDevBypass: true,
        };
      },
    }),
  );
}

async function resolveRoles(token: JWT): Promise<JWT> {
  if (token.isDevBypass) return token;

  const email = typeof token.email === "string" ? token.email : null;
  const roles: Role[] = ["viewer"];
  let roleError: string | undefined;

  if (token.accessToken) {
    const membership = await resolveGroupMembership(token.accessToken);
    if (membership.error) roleError = membership.error;
    if (membership.isReferee) roles.push("referee");
    if (membership.isAdmin) roles.push("admin");
  } else {
    roleError = "No Microsoft Graph access token on the session.";
  }

  if (isAllowlistedAdmin(email) && !roles.includes("admin")) roles.push("admin");

  token.roles = roles;
  token.rolesCheckedAt = Date.now();
  token.roleError = roleError;
  return token;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
    async jwt({ token, account, user, trigger }) {
      if (user) {
        token.uid = user.id ?? token.sub;
        token.isDevBypass = Boolean(user.isDevBypass);
        if (user.roles) token.roles = [...user.roles];
      }

      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.rolesCheckedAt = undefined; // force a fresh Graph check
      }

      const stale = !token.rolesCheckedAt || Date.now() - token.rolesCheckedAt > ROLE_CACHE_TTL_MS;

      if (trigger === "update" || stale) {
        return resolveRoles(token);
      }

      return token;
    },

    async session({ session, token }) {
      const roles = (token.roles ?? ["viewer"]) as Role[];
      session.user = {
        ...session.user,
        id: token.uid ?? token.sub ?? "",
        roles,
        isReferee: roles.includes("referee"),
        isAdmin: roles.includes("admin"),
        isDevBypass: Boolean(token.isDevBypass),
        roleError: token.roleError,
      };
      return session;
    },
  },
});

/** Exposed so the sign-in page can explain what is (not) configured. */
export const authProviderStatus = {
  entraConfigured: hasEntraConfig(),
  devBypassEnabled: config.devAuthBypass,
};
