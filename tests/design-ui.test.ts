import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ColorPalettePicker } from "@/components/color-palette-picker";
import { MatchList, MatchRow, StandingsTable } from "@/components/match-display";
import { SiteHeader } from "@/components/site-header";
import { TeamColorBar } from "@/components/team-colors";
import { ThemeToggle } from "@/components/theme-toggle";
import { DEFAULT_ALTERNATE, DEFAULT_PRIMARY } from "@/lib/kits";
import type { MatchListItem } from "@/lib/queries";
import { calculateStandings } from "@/lib/standings";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const kickoff = new Date("2026-09-17T00:30:00Z");
const fixture: MatchListItem = {
  id: "fixture-1",
  seasonId: "fall-2026",
  divisionId: "premier",
  homeTeamId: "sos",
  awayTeamId: "chargers",
  venueName: "Field 1",
  kickoffAt: kickoff,
  matchweek: "Cup R1",
  countsForStandings: true,
  status: "ASSIGNED",
  homeKit: "PRIMARY",
  awayKit: "ALTERNATE",
  refereeId: "ref-1",
  assignedAt: kickoff,
  version: 0,
  notes: null,
  createdAt: kickoff,
  updatedAt: kickoff,
  homeTeam: {
    id: "sos",
    slug: "sos",
    name: "SOS",
    shortName: "SOS",
    colorPrimary: "#123456",
    colorAlternate: "#ffffff",
  },
  awayTeam: {
    id: "chargers",
    slug: "chargers",
    name: "Chargers",
    shortName: "CHA",
    colorPrimary: "#ffff00",
    colorAlternate: "#fedcba",
  },
  division: { id: "premier", slug: "premier", name: "Premier League" },
  referee: { id: "ref-1", name: "Private referee name" },
  report: null,
};

describe("MatchList layout", () => {
  it("keeps the default layout for schedule and team pages", () => {
    const html = renderToStaticMarkup(createElement(MatchList, { matches: [] }));

    expect(html).toBe('<ul class="grid gap-3"></ul>');
  });

  it("allows caller-specified equal-height grids", () => {
    const html = renderToStaticMarkup(
      createElement(MatchList, { matches: [], className: "flex-1 grid-rows-4" }),
    );

    expect(html).toBe('<ul class="grid gap-3 flex-1 grid-rows-4"></ul>');
  });

  it("keeps four-row home-page lists with real fixture data and Pacific time", () => {
    const html = renderToStaticMarkup(
      createElement(MatchList, {
        matches: [fixture],
        className: "flex-1 grid-rows-4",
      }),
    );
    expect(html).toContain("flex-1 grid-rows-4");
    expect(html).toContain('dateTime="2026-09-17T00:30:00.000Z"');
    expect(html).toContain("Wed 16 Sep");
    expect(html).toContain("17:30");
    expect(html).toContain("PDT");
    expect(html).toContain("Cup R1");
    expect(html).toContain("Field 1");
    expect(html).toContain('href="/teams/chargers"');
    expect(html).toContain("their alternate kit");
    expect(html).not.toContain("Private referee name");
    expect(html).not.toContain("Needs referee");
    expect(html).not.toContain("Not started");
  });

  it("keeps awarded scores, forfeiting teams and disputes on result cards", () => {
    const html = renderToStaticMarkup(
      createElement(MatchRow, {
        match: {
          ...fixture,
          status: "CONFIRMED",
          report: {
            id: "report-1",
            status: "DISPUTED",
            homeScore: 0,
            awayScore: 0,
            homeForfeit: false,
            awayForfeit: true,
            submittedAt: kickoff,
          },
        },
      }),
    );
    expect(html).toContain("Forfeit");
    expect(html).toContain("Disputed");
    expect(html).toContain("3\u20130");
  });

  it.each(["CANCELLED", "POSTPONED"])(
    "preserves %s statuses without exposing assignments",
    (status) => {
      const html = renderToStaticMarkup(createElement(MatchRow, { match: { ...fixture, status } }));
      expect(html.toLowerCase()).toContain(status.toLowerCase());
      expect(html).not.toContain("Private referee name");
    },
  );

  it("shows a zero-zero result rather than mistaking it for an unplayed fixture", () => {
    const html = renderToStaticMarkup(
      createElement(MatchRow, {
        match: {
          ...fixture,
          status: "REPORT_SUBMITTED",
          venueName: null,
          report: {
            id: "report-2",
            status: "SUBMITTED",
            homeScore: 0,
            awayScore: 0,
            homeForfeit: false,
            awayForfeit: false,
            submittedAt: kickoff,
          },
        },
      }),
    );
    expect(html).toContain("0\u20130");
    expect(html).toContain("TBD");
  });
});

describe("TeamColorBar", () => {
  const team = { colorPrimary: "#123456", colorAlternate: "#fedcba" };

  it("keeps both kit colours in separate solid blocks, primary first", () => {
    const html = renderToStaticMarkup(createElement(TeamColorBar, { team }));

    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/style="background-color:/g)).toHaveLength(2);
    expect(html).toContain("background-color:#123456");
    expect(html).toContain("background-color:#fedcba");
    expect(html.indexOf("#123456")).toBeLessThan(html.indexOf("#fedcba"));
    expect(html).not.toContain("gradient");
  });

  it("preserves default kit colours when registration data is missing", () => {
    const html = renderToStaticMarkup(
      createElement(TeamColorBar, { team: { colorPrimary: null, colorAlternate: "" } }),
    );

    expect(html).toContain(`background-color:${DEFAULT_PRIMARY}`);
    expect(html).toContain(`background-color:${DEFAULT_ALTERNATE}`);
  });

  it.each([
    { size: "sm", dimensions: "h-4 w-1.5" },
    { size: "md", dimensions: "h-6 w-2" },
    { size: "lg", dimensions: "h-9 w-2.5" },
  ] as const)("preserves the $size bar dimensions", ({ size, dimensions }) => {
    const html = renderToStaticMarkup(createElement(TeamColorBar, { team, size }));

    expect(html).toContain(dimensions);
    expect(html).toContain("flex-col");
    expect(html).toContain("overflow-hidden");
  });
});

describe("Matchday identity", () => {
  it("never selects a theme from operating-system settings", () => {
    function checkDirectory(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          checkDirectory(file);
        } else if (/\.(tsx?|css)$/.test(entry.name)) {
          expect(readFileSync(file, "utf8"), file).not.toMatch(
            /prefers-color-scheme|matchMedia\s*\(/,
          );
        }
      }
    }
    checkDirectory(path.join(process.cwd(), "src"));
  });

  it("preserves the original landing-page hierarchy and four matches in each list", () => {
    const home = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    const sections = [
      "Microsoft Soccer League",
      'title="Announcements"',
      'title="Next fixtures"',
      'title="Latest results"',
      "title={`${topDivision.divisionName} snapshot`}",
      'title="Quick links"',
    ];
    const positions = sections.map((section) => home.indexOf(section));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(home).toContain("getUpcomingMatches(season.id, 4)");
    expect(home).toContain("getRecentResults(season.id, 4)");
    expect(home).toContain("grid auto-rows-fr gap-8 lg:grid-cols-2");
    expect(home).not.toContain("matchday-columns");
    expect(home).not.toContain("The matchweek starts here");
  });

  it("preserves the light palette and adds explicitly selected dark tokens", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(css).toContain("--brand: #204cda");
    expect(css).toContain("--foreground: #142739");
    expect(css).toContain("--surface-muted: #f1f4f8");
    expect(css).toContain("--text-base: 0.875rem");
    expect(css).toContain("color-scheme: light");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain(
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))',
    );
    expect(layout).toContain("Archivo_Narrow");
    expect(layout).toContain("themeInitScript");
    expect(layout).toContain('data-theme="light"');
    expect(layout.indexOf("__html: themeInitScript")).toBeLessThan(layout.indexOf("<body"));
  });

  it("retains accessible mobile navigation and exposes the theme toggle", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { user: null }));
    expect(html).toContain('aria-label="Toggle navigation"');
    expect(html).toContain('aria-controls="mobile-nav"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="#main"');
    expect(html).toContain("lucide-menu");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-label="Dark mode"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('href="/admin/matches"');
    expect(html).not.toContain('href="/referee"');
    expect(html).not.toMatch(new RegExp("\\p{Extended_Pictographic}", "u"));
  });

  it("renders the toggle in light mode during SSR without reading browser storage", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));
    expect(html).toContain('aria-label="Dark mode"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('title="Switch to dark mode"');
    expect(html).toContain("lucide-moon");
    expect(html).toContain('aria-hidden="true"');
  });

  it("keeps the theme toggle subtle and sized to the sign-in control", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));
    expect(html).toContain("text-muted hover:text-foreground");
    expect(html).toContain("cursor-pointer");
    expect(html).toContain("rounded-sm p-2");
    expect(html).toContain('height="18"');
    expect(html).not.toContain("bg-surface-muted");
    expect(html).not.toContain("h-10 w-10");
  });

  it("keeps referee and admin navigation role-gated", () => {
    const html = renderToStaticMarkup(
      createElement(SiteHeader, {
        user: {
          name: "League admin",
          email: null,
          isAdmin: true,
          isReferee: true,
          isDevBypass: false,
        },
      }),
    );
    expect(html).toContain('href="/admin/matches"');
    expect(html).toContain('href="/referee"');
    expect(html).toContain('href="/account"');
  });

  it("does not recolour clickable table rows on hover", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/clickable-row.tsx"),
      "utf8",
    );
    expect(source).toContain("cursor-pointer");
    expect(source).not.toContain("hover:bg");
  });

  it("uses shared 2px gray row borders instead of table fills", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--table-row-border: var(--surface-muted)");
    expect(css).toContain(".data-table > :is(tbody, tfoot) > tr");
    expect(css).not.toContain(".data-table > :is(thead, tbody, tfoot) > tr");
    expect(css).toContain("border: 2px solid var(--table-row-border)");
    expect(css).toContain("border-collapse: collapse");
    expect(css).not.toContain("nth-child(even)");
  });

  it.each([
    ["src", "components", "match-display.tsx"],
    ["src", "components", "schedule-import-form.tsx"],
    ["src", "app", "admin", "matches", "page.tsx"],
    ["src", "app", "admin", "audit", "page.tsx"],
  ])("uses the shared row treatment in %s", (...segments) => {
    const source = readFileSync(path.join(process.cwd(), ...segments), "utf8");
    expect(source).toContain("data-table");
    expect(source).not.toMatch(/<thead[^>]*bg-surface-muted/);
    expect(source).not.toMatch(/<tbody[^>]*divide-y/);
  });

  it("keeps ranking metrics and administrative adjustments in compact tables", () => {
    const rows = calculateStandings([{ id: "sos", name: "SOS", divisionId: "premier" }], [], {
      adjustments: [{ teamId: "sos", points: -3 }],
    });
    const html = renderToStaticMarkup(
      createElement(StandingsTable, {
        rows,
        caption: "Premier League",
        compact: true,
        primaryMetric: "pointsPerGame",
      }),
    );
    expect(html).toContain("standings-table-compact");
    expect(html).toContain("data-table");
    expect(html).toContain('scope="row"');
    expect(html).toContain("PPG");
    expect(html).toContain("point adjustment applied by the league administrator");
    expect(html).not.toContain("hover:bg");
  });
});

describe("ColorPalettePicker", () => {
  it("keeps the selected colour and accessible radio state with a Lucide checkmark", () => {
    const html = renderToStaticMarkup(
      createElement(ColorPalettePicker, {
        name: "colorPrimary",
        defaultValue: DEFAULT_PRIMARY,
        labelledBy: "primary-kit",
      }),
    );

    expect(html).toContain(`name="colorPrimary" value="${DEFAULT_PRIMARY}"`);
    expect(html).toContain('aria-labelledby="primary-kit"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain("lucide-check");
    expect(html).not.toContain("&#10003;");
  });
});
