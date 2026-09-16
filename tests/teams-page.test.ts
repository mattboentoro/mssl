import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import TeamsPage from "@/app/teams/page";
import { getTeams } from "@/lib/queries";

vi.mock("@/lib/queries", () => ({ getTeams: vi.fn() }));

const now = new Date("2026-09-16T12:00:00Z");
const team: Awaited<ReturnType<typeof getTeams>>[number] = {
  id: "united",
  divisionId: "premier",
  name: "Test United",
  slug: "test-united",
  shortName: "UNITED",
  colorPrimary: "#204cda",
  colorAlternate: "#ffffff",
  createdAt: now,
  updatedAt: now,
  division: { id: "premier", name: "Premier League", slug: "premier" },
  captains: [],
};

describe("Teams page merge", () => {
  it.each([
    { names: [], label: "UNITED" },
    { names: ["Alex"], label: "Captain: Alex" },
    { names: ["Alex", "Sam"], label: "Captains: Alex, Sam" },
    { names: ["Alex", "Sam", "Jo", "Lee", "Pat"], label: "Captains: Alex, Sam, Jo, Lee, Pat" },
  ])("keeps captain data and approved styling for $names", async ({ names, label }) => {
    vi.mocked(getTeams).mockResolvedValue([
      {
        ...team,
        captains: names.map((name, index) => ({
          id: `captain-${index}`,
          teamId: team.id,
          name,
          email: `${name.toLowerCase()}@example.com`,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })),
      },
    ]);

    const html = renderToStaticMarkup(await TeamsPage());
    expect(html).toContain(label);
    expect(html).toContain("Test United");
    expect(html).toContain("Premier League");
    expect(html).toContain('href="/teams/test-united"');
    expect(html).toContain('class="group block p-5"');
    expect(html).toContain("group-hover:text-brand");
    expect(html).toContain("group-hover:underline");
    expect(html).not.toContain("@example.com");
  });

  it("retains the empty league state", async () => {
    vi.mocked(getTeams).mockResolvedValue([]);
    expect(renderToStaticMarkup(await TeamsPage())).toContain("No teams yet");
  });
});
