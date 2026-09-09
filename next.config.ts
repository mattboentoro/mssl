import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't auto-generate AGENTS.md / CLAUDE.md into the repo root.
  agentRules: false,

  // `@prisma/client` must stay a real Node require in server bundles.
  serverExternalPackages: ["@prisma/client", "@prisma/engines"],
};

export default nextConfig;
