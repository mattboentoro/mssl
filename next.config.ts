import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't auto-generate AGENTS.md / CLAUDE.md into the repo root.
  agentRules: false,

  // These packages must stay real Node requires in server bundles.
  serverExternalPackages: ["@prisma/client", "@prisma/engines", "read-excel-file"],

  experimental: {
    // Lets server components call `forbidden()` / `unauthorized()` so denied
    // requests answer with a real 403/401 instead of a 200 carrying an error.
    authInterrupts: true,
  },
};

export default nextConfig;
