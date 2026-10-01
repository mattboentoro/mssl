import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Admin users and roles", () => {
  it("limits global role controls and keeps action results out of the layout", () => {
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/admin/users/page.tsx"),
      "utf8",
    );
    const enums = fs.readFileSync(path.join(process.cwd(), "src/lib/enums.ts"), "utf8");

    expect(enums).toContain('ASSIGNABLE_ROLES = ["REFEREE", "ADMIN"]');
    expect(enums).not.toContain('ASSIGNABLE_ROLES = ["PLAYER"');
    expect(page).toContain("showSuccess={false}");
    expect(page).toContain("lg:grid-cols-[minmax(0,1fr)_auto]");
    expect(page).toContain('role === "REFEREE" || role === "ADMIN"');
    expect(page).not.toContain("<Badge>viewer</Badge>");
    expect(page).toContain('placeholder="Name, email, or role"');
    expect(page).toContain("All roles");
    expect(page).toContain("All statuses");
    expect(page).toContain("All teams");
    expect(page).toContain('"roles-asc"');
    expect(page).toContain('"roles-desc"');
    expect(page).toContain('className="px-2 py-1 text-xs"');
    expect(page).toContain("role.toLowerCase()");
  });
});
