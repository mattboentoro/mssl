import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("account player history", () => {
  it("moves player history into Account and removes redundant navigation", () => {
    const account = source("src/app/account/page.tsx");
    const player = source("src/app/player/page.tsx");
    const header = source("src/components/site-header.tsx");
    const afterSignIn = source("src/app/after-signin/page.tsx");
    const roster = source("src/app/roster/page.tsx");

    expect(header).not.toContain('links.push({ href: "/player"');
    expect(header).not.toContain('|| "Viewer"');
    expect(player).toContain('redirect("/account")');
    expect(afterSignIn).toContain('if (isPlayer) redirect("/account")');
    expect(roster).toContain('backHref={user.isCaptain ? "/captain/roster" : "/account"}');
    expect(account).toContain("Seasons played");
    expect(account).toContain("prisma.teamMembership.findMany");
    expect(account).toContain("prisma.disciplinaryAction.findMany");
    expect(account).toContain("SUSPENSION_REASON_LABELS");
    expect(account).toContain('role !== "viewer"');
    expect(account).not.toContain("Go to Player dashboard");
    expect(account).not.toContain("Go to Captain dashboard");
    expect(account).not.toContain("Go to Referee Control");
  });
});
