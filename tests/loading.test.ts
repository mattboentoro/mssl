import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ScheduleLoading from "@/app/schedule/loading";
import MatchesLoading from "@/app/admin/matches/loading";
import UsersLoading from "@/app/admin/users/loading";
import RosterLoading from "@/app/admin/roster/loading";
import WorkflowsLoading from "@/app/admin/workflows/loading";
import AccountLoading from "@/app/account/loading";
import { SectionSkeleton } from "@/components/loading";

describe("route loading boundaries", () => {
  it.each([
    ["schedule", ScheduleLoading],
    ["matches", MatchesLoading],
    ["users &amp; roles", UsersLoading],
    ["rosters", RosterLoading],
    ["reviews", WorkflowsLoading],
    ["account", AccountLoading],
  ] as const)("provides an accessible %s loading state", (name, Loading) => {
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).toContain(`role="status" class="sr-only">Loading ${name}...`);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/class="[^"]*(?<!motion-safe:)animate-pulse/);
    expect(html).not.toMatch(/<(input|button|a)\b/);
  });

  it("uses responsive stable section skeletons for dashboard cards and rows", () => {
    const cards = renderToStaticMarkup(
      createElement(SectionSkeleton, { label: "League totals", cards: 6 }),
    );
    expect(cards).toContain("Loading league totals...");
    expect(cards).toContain("grid-cols-2");
    expect(cards).toContain("sm:grid-cols-3");
    expect(cards).toContain("lg:grid-cols-6");
    const rows = renderToStaticMarkup(
      createElement(SectionSkeleton, { label: "Recent activity", rows: 8 }),
    );
    expect(rows).toContain("Loading recent activity...");
    expect(rows.match(/h-5 w-2\/3/g)).toHaveLength(8);
  });
});
