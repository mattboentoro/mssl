import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Admin RBAC operational controls", () => {
  it("keeps every review queue reachable and routes actions through authorized domain transitions", () => {
    const layout = source("src/app/admin/layout.tsx");
    const matches = source("src/app/admin/matches/page.tsx");
    const detail = source("src/app/admin/matches/[id]/page.tsx");
    const actions = source("src/app/admin/workflows/actions.ts");

    expect(layout).toContain("/admin/workflows");
    expect(matches).toContain("/admin/workflows");
    expect(detail).toContain("/admin/workflows");
    expect(actions).toContain("requireAdmin()");
    expect(actions).toContain("reviewRescheduleAsAdmin");
    expect(actions).toContain("reviewCaptainResult");
    expect(actions).toContain("acceptScoreAppeal");
    expect(actions).toContain("rejectScoreAppeal");
  });

  it("keeps roster administration read-only and delegates changes to Manage roster", () => {
    const page = source("src/app/admin/roster/page.tsx");
    expect(page).toContain("Captainless");
    expect(page).toContain("season.isActive");
    expect(page).toContain('name="team"');
    expect(page).toContain('name="q"');
    expect(page).toContain('name="state"');
    expect(page).toContain('name="players"');
    expect(page).toContain('as="details"');
    expect(page).toContain("<summary");
    expect(page).toContain("<MatchDisclosureStack");
    expect(page).toContain("list-none");
    expect(page).not.toContain("<MatchDisclosureHint");
    expect(page).toContain("Manage roster");
    expect(page).toContain("{ seasonId: null }");
    expect(page).toContain("Active players");
    expect(page).toContain("Registered Captains and team contacts");
    expect(page).toContain("memberships.map");
    expect(page.indexOf("<summary")).toBeLessThan(page.indexOf("Active players"));
    expect(page).not.toContain("Save identity");
    expect(page).not.toContain("relinkCaptain");
  });

  it("keeps raw rating identity and comments in the Admin-only page", () => {
    const adminLayout = source("src/app/admin/layout.tsx");
    const adminRatings = source("src/app/admin/ratings/page.tsx");
    const refereeRatings = source("src/app/referee/ratings/page.tsx");
    expect(adminLayout).toContain("requireAdmin");
    expect(adminRatings).toContain("rating.comment");
    expect(adminRatings).toContain("rating.ratedBy");
    expect(refereeRatings).not.toContain("rating.comment");
    expect(refereeRatings).not.toContain("ratedBy");
  });
});
