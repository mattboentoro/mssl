import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Admin workflow reviews", () => {
  it("shows score appeals as distinct current, original, and requested panels", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/admin/workflows/page.tsx"),
      "utf8",
    );

    expect(page).toContain('tone: "current" | "original" | "requested"');
    expect(page).toContain('label="Current official"');
    expect(page).toContain('label="Original snapshot"');
    expect(page).toContain('label="Requested correction"');
    expect(page).toContain("border-brand/35 bg-brand/5");
    expect(page).toContain("border-warning/40 bg-warning/10");
    expect(page).toContain("border-success/40 bg-success/10");
    expect(page).toContain("text-2xl font-bold tabular-nums");
    expect(page).toContain("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
    expect(page).toContain("summary={");
    expect(page).toContain("Score appeal");
    expect(page).toContain("appeal.match.matchweek");
    expect(page).toContain("appeal.match.venueName");
  });
});
