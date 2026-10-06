import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KIT_PALETTE, readableTextOn } from "@/lib/kits";

const css = readFileSync("src/app/globals.css", "utf8");
type Color = number[];
const luminance = (color: Color) =>
  color
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a: Color, b: Color) => {
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

describe("theme contrast and high-contrast fallbacks", () => {
  it("keeps selected checkmarks readable against every stored palette color", () => {
    const rgb = (hex: string) =>
      hex
        .slice(1)
        .match(/.{2}/g)!
        .map((channel) => parseInt(channel, 16));
    for (const { hex, name } of KIT_PALETTE) {
      expect(contrast(rgb(hex), rgb(readableTextOn(hex))), name).toBeGreaterThanOrEqual(4.5);
    }
  });
  for (const theme of [":root", ".dark"]) {
    it(`${theme} meets text, tinted-status, interactive-border and focus contrast thresholds`, () => {
      const block = css.slice(css.indexOf(`${theme} {`)).split("}")[0];
      const tokens = Object.fromEntries(
        [...block.matchAll(/--([\w-]+): (#[\da-f]{6});/g)].map((match) => [
          match[1],
          match[2]
            .slice(1)
            .match(/.{2}/g)!
            .map((channel) => parseInt(channel, 16)),
        ]),
      );
      for (const surface of ["surface", "background", "surface-muted"]) {
        for (const text of ["foreground", "muted"])
          expect(
            contrast(tokens[text], tokens[surface]),
            `${theme} ${text}/${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(tokens["control-border"], tokens[surface]),
          `${theme} border/${surface}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrast(tokens.accent, tokens[surface]),
          `${theme} focus/${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
      for (const tone of ["brand", "accent", "danger", "warning", "success"]) {
        const tint = tokens[tone].map((value, index) => value * 0.1 + tokens.surface[index] * 0.9);
        expect(contrast(tokens[tone], tint), `${theme} ${tone} badge/alert`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      for (const tone of ["success", "danger", "accent"])
        expect(
          contrast(tokens[tone], tokens["status-contrast"]),
          `${theme} filled ${tone}`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.brand, tokens["brand-contrast"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme} keeps the bar boundary and split visible for white, near-white, black and near-black kits`, () => {
      const block = css.slice(css.indexOf(`${theme} {`)).split("}")[0];
      const rgb = (hex: string) =>
        hex.match(/[\da-f]{2}/gi)!.map((channel) => parseInt(channel, 16));
      const foreground = rgb(block.match(/--foreground: (#[\da-f]{6});/)![1]);
      const surface = rgb(block.match(/--surface: (#[\da-f]{6});/)![1]);
      const edgeCases = theme === ":root" ? ["#ffffff", "#f8fafc"] : ["#000000", "#111111"];
      for (const color of edgeCases) {
        expect(
          contrast(foreground, rgb(color)),
          `outer boundary against ${color}`,
        ).toBeGreaterThanOrEqual(3);
      }
      for (const color of ["#ffffff", "#f8fafc", "#000000", "#111111"]) {
        expect(
          Math.max(contrast(foreground, rgb(color)), contrast(surface, rgb(color))),
          `two-tone divider against ${color}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("gives compact two-color bars a 3px visible boundary without shrinking their colored interior", () => {
    const bar = css.match(/\.team-color-bar\s*\{([^}]+)\}/)![1];
    const divider = css.match(/\.team-color-bar::after\s*\{([^}]+)\}/)![1];
    expect(bar).toContain("border: 2px solid var(--foreground)");
    expect(bar).toContain("outline: 1px solid var(--foreground)");
    expect(bar).toContain("outline-offset: 0");
    expect(bar).not.toContain("box-shadow");
    expect(divider).toContain("top: 50%");
    expect(divider).toContain("height: 2px");
    expect(divider).toContain("border-top: 1px solid var(--foreground)");
    expect(divider).toContain("border-bottom: 1px solid var(--surface)");
    const forcedColors = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(forcedColors).toMatch(
      /\.team-color-bar\s*\{\s*border-color: CanvasText;\s*outline-color: CanvasText;/,
    );
    expect(forcedColors).toMatch(
      /\.team-color-bar::after\s*\{\s*border-top-color: CanvasText;\s*border-bottom-color: Canvas;/,
    );
    expect(forcedColors).not.toContain("forced-color-adjust: none");
  });

  it("uses system colors, real swatch borders, non-color selection and disabled states, and reduced motion", () => {
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-color: Highlight");
    expect(css).toContain("border: 1px solid ButtonText");
    expect(css).toContain("--brand-contrast: CanvasText");
    expect(css).toContain("--status-contrast: CanvasText");
    expect(css).toContain(":is(.bg-brand, .bg-success, .bg-danger, .bg-accent)");
    expect(css).toContain("color: GrayText");
    expect(css).toContain("border-style: dashed");
    expect(css).toContain(".forced-colors-label");
    expect(css).toContain(".forced-colors-description");
    expect(css).toMatch(/\.kit-colors\s*\{[^}]*max-width: 9rem;[^}]*flex-wrap: wrap/);
    expect(css).toContain('aria-checked="true"');
    expect(css).not.toContain("forced-color-adjust: none");
    expect(css).toMatch(/\.color-swatch\s*\{[^}]*border: 1px solid var\(--foreground\)/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/id="main"\s+tabIndex=\{-1\}/);
  });
});
