import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

describe("public cache boundaries and mutation coverage", () => {
  it("allows cached read imports only on explicitly public routes, never private surfaces", () => {
    const allowed = new Set(
      [
        "src/app/page.tsx",
        "src/app/schedule/page.tsx",
        "src/app/standings/page.tsx",
        "src/app/teams/page.tsx",
        "src/app/teams/[id]/page.tsx",
        "src/app/rules/page.tsx",
        "src/app/free-agents/page.tsx",
      ].map((file) => path.normalize(file)),
    );
    for (const file of filesUnder("src")) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      if (source(file).includes('from "@/lib/public-queries"'))
        expect(allowed.has(file), file).toBe(true);
    }
    for (const file of allowed)
      expect(source(file)).toContain('export const dynamic = "force-dynamic"');
    const cached = source("src/lib/public-queries.ts");
    for (const forbidden of [
      "getCurrentUser",
      "requireUser",
      "requireAdmin",
      "headers(",
      "cookies(",
      "freeAgentRequest",
      "teamMembership",
      "rosterInvitation",
    ]) {
      expect(cached).not.toContain(forbidden);
    }
    expect(source("src/lib/queries.ts")).not.toContain("unstable_cache");
    const freeAgents = source("src/app/free-agents/page.tsx");
    expect(freeAgents).toContain("getPublicDivisions()");
    expect(freeAgents).toContain("await getCurrentUser()");
    expect(freeAgents).toContain("prisma.freeAgentRequest.findUnique");
    expect(freeAgents).toContain("getActiveTeamAssociation(prisma, user.appUserId)");
    const team = source("src/app/teams/[id]/page.tsx");
    expect(team).toContain("getCurrentUser()");
    expect(team).toContain("prisma.rescheduleRequest.findMany");
    expect(team).toContain("prisma.rescheduleSlot.findFirst");
  });

  it("routes every match mutation POST through post-commit invalidation", () => {
    const routes = filesUnder(path.join("src", "app", "api", "matches")).filter((file) =>
      file.endsWith("route.ts"),
    );
    expect(routes).toHaveLength(9);
    for (const file of routes) {
      expect(source(file), file).toContain("export async function POST(");
      expect(source(file), file).toContain("return handleMatchMutation(async () =>");
      expect(source(file), file).not.toContain("unstable_cache");
    }
  });

  it("keeps all admin mutations wired to the correct public domain", () => {
    const admin = source("src/app/admin/actions.ts");
    const domains = {
      createSeasonAction: "league",
      updateSeasonAction: "league",
      deleteSeasonAction: "league",
      createDivisionAction: "league",
      updateDivisionAction: "league",
      deleteDivisionAction: "league",
      createTeamAction: "teams",
      updateTeamAction: "teams",
      deleteTeamAction: "teams",
      createPointsAdjustmentAction: "standings",
      deletePointsAdjustmentAction: "standings",
      createDisciplinaryAction: "discipline",
      setSuspensionAction: "discipline",
      deleteDisciplinaryActionAction: "discipline",
      createMatchAction: "matches",
      deleteMatchAction: "matches",
      importScheduleAction: "league",
      createAnnouncementAction: "content",
      updateAnnouncementAction: "content",
      deleteAnnouncementAction: "content",
      createDocumentAction: "content",
      updateDocumentAction: "content",
      deleteDocumentAction: "content",
      deleteFreeAgentRequest: "freeAgents",
    };
    for (const [name, domain] of Object.entries(domains)) {
      const body = admin
        .split(`export async function ${name}(`)[1]
        ?.split("export async function ")[0];
      expect(body, name).toContain(
        domain === "league" ? "refreshAdmin();" : `refreshAdmin("${domain}");`,
      );
    }
    expect(admin).toContain('function refreshAdmin(domain: PublicCacheDomain = "league")');
    expect(admin).toContain("invalidatePublicData(domain)");
  });

  it("covers workflow, roster, profile/logo, and free-agent action invalidation", () => {
    for (const file of [
      "src/app/admin/workflows/actions.ts",
      "src/app/captain/results/actions.ts",
      "src/app/captain/reschedules/actions.ts",
    ]) {
      expect(source(file)).toContain('invalidatePublicData("matches")');
    }
    expect(source("src/app/roster/actions.ts")).toContain(
      'invalidatePublicData("teams", "freeAgents")',
    );
    const profiles = source("src/app/captain/teams/[id]/profile/actions.ts");
    expect(profiles).toContain('invalidatePublicData("teams")');
    expect(profiles.match(/onCommitted: \(\) => refresh\(teamId\)/g)).toHaveLength(2);
    expect(
      source("src/app/free-agents/actions.ts").match(/invalidatePublicData\("freeAgents"\)/g),
    ).toHaveLength(2);
    expect(source("src/app/captain/free-agents/actions.ts")).toContain(
      'invalidatePublicData("freeAgents", "teams")',
    );
  });

  it("preserves private calendar and CSV policy without caching API reads or auth", () => {
    expect(source("src/app/calendar.ics/route.ts")).toContain('"private, no-store"');
    expect(source("src/app/admin/schedule.csv/route.ts")).toContain('"Cache-Control": "no-store"');
    for (const file of [
      "src/lib/authz.ts",
      "src/lib/rbac.ts",
      "src/auth.ts",
      "src/app/account/page.tsx",
      "src/app/notifications/page.tsx",
      "src/app/roster/page.tsx",
    ]) {
      expect(source(file)).not.toContain("unstable_cache");
      expect(source(file)).not.toContain("public-queries");
    }
    expect(source("src/lib/ical.ts")).toContain('cacheControl = "public, max-age=300"');
  });
});
