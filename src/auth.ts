import NextAuth, { type DefaultSession } from "next-auth";
import type { JWT as _JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { config, hasEntraConfig } from "@/lib/config";
import type { Role } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { claimApplicationIdentity, loadAuthorization, type TeamContext } from "@/lib/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      appUserId: string;
      roles: Role[];
      teamContexts: TeamContext[];
      isPlayer: boolean;
      isCaptain: boolean;
      isReferee: boolean;
      isAdmin: boolean;
      /** True when the session came from the dev-only bypass provider. */
      isDevBypass: boolean;
      /** Set when application identity or authorization could not be loaded. */
      roleError?: string;
    } & DefaultSession["user"];
  }

  interface User {
    appUserId?: string;
    teamContexts?: TeamContext[];
    isDevBypass?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    appUserId?: string;
    isDevBypass?: boolean;
  }
}

export const DEV_BYPASS_IDENTITIES = {
  referee: {
    id: "dev-referee",
    name: "Riley Whistle (dev referee)",
    email: "riley.whistle@example.com",
  },
  referee2: {
    id: "dev-referee-2",
    name: "Sam Sideline (dev referee)",
    email: "sam.sideline@example.com",
  },
  admin: {
    id: "dev-admin",
    name: "Alex Board (dev admin)",
    email: "alex.board@example.com",
  },
  viewer: {
    id: "dev-viewer",
    name: "Casey Fan (dev viewer)",
    email: "casey.fan@example.com",
  },
  player: {
    id: "dev-player",
    name: "Jordan Striker (dev player)",
    email: "jordan.striker@example.com",
  },
  player2: {
    id: "dev-player-2",
    name: "Taylor Keeper (dev player)",
    email: "taylor.keeper@example.com",
  },
  captainHome: {
    id: "dev-captain-home",
    name: "Morgan Home (dev captain)",
    email: "morgan.home@example.com",
  },
  captainAway: {
    id: "dev-captain-away",
    name: "Avery Away (dev captain)",
    email: "avery.away@example.com",
  },
  multiRole: {
    id: "dev-multi-role",
    name: "Quinn Utility (dev multi-role)",
    email: "quinn.utility@example.com",
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
          scope: "openid profile email offline_access User.Read",
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
          isDevBypass: true,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
    async jwt({ token, account, user }) {
      if (user) {
        token.uid = account?.providerAccountId ?? user.id ?? token.sub;
        token.isDevBypass = Boolean(user.isDevBypass);
      }
      return token;
    },

    async session({ session, token }) {
      let roles: Role[] = ["viewer"];
      let teamContexts: TeamContext[] = [];
      let appUserId = "";
      let roleError: string | undefined;
      const objectId = token.uid ?? token.sub ?? "";
      const email = typeof token.email === "string" ? token.email : "";
      try {
        const appUser = await claimApplicationIdentity(prisma, {
          entraObjectId: objectId,
          email,
          displayName: typeof token.name === "string" ? token.name : email,
        });
        appUserId = appUser.id;
        token.appUserId = appUser.id;
        const authorization = await loadAuthorization(prisma, appUser.id);
        roles = authorization.roles;
        teamContexts = authorization.teamContexts;
      } catch (error) {
        roleError =
          error instanceof Error ? error.message : "Application roles could not be loaded.";
      }
      session.user = {
        ...session.user,
        id: objectId,
        appUserId,
        roles,
        teamContexts,
        isPlayer: roles.includes("player"),
        isCaptain: roles.includes("captain"),
        isReferee: roles.includes("referee"),
        isAdmin: roles.includes("admin"),
        isDevBypass: Boolean(token.isDevBypass),
        roleError,
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
