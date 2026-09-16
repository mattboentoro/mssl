import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ColorPalettePicker } from "@/components/color-palette-picker";
import { TeamColorBar } from "@/components/team-colors";
import { ThemeToggle } from "@/components/theme-toggle";
import { DEFAULT_ALTERNATE, DEFAULT_PRIMARY } from "@/lib/kits";

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

describe("ThemeToggle", () => {
  it("renders an accessible Lucide control instead of an emoji", () => {
    const html = renderToStaticMarkup(createElement(ThemeToggle));

    expect(html).toContain('aria-label="Switch to dark theme"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("lucide-moon");
    expect(html).toContain('stroke="currentColor"');
    expect(html).not.toMatch(new RegExp("\\p{Extended_Pictographic}", "u"));
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
