# MSSL UI instructions

## Selected direction: Matchday with Touchline colours

- Use **Matchday's match-programme typography and styling** with **Touchline's cobalt palette**.
  This is the approved site direction, not a choice between the two previews.
  The reference is `public/design-directions.html`: Matchday supplies the
  typographic character and flat surfaces; Touchline supplies the colours.
  The preview is a visual reference, not permission to replace existing page layouts.
- Support light and dark mode across public, referee and admin screens.
  **Light is the default, regardless of operating-system settings.** Dark mode
  requires an explicit choice through the header toggle or a previously saved
  `"dark"` preference. Missing, invalid or unreadable preferences mean light.
- Keep theme state in `html[data-theme]` and persist only `"light"` or `"dark"`
  under `mssl-theme` in local storage. `src/lib/theme.ts` owns the shared state and
  pre-paint initialization; `ThemeToggle` provides the accessible Lucide control.
  Keep the initialization script in the root head to avoid a flash on reload.
  Keep the header toggle subtle: an unfilled, muted 18px icon with 8px padding,
  matching the Sign in button's 34px height rather than a larger filled tile.
  Sync changes across tabs; log storage errors and surface failed saves without
  preventing the current page from switching. Do not read `prefers-color-scheme`.
- Prefer shared theme tokens. Use the configured `dark:*` variant only for
  necessary exceptions such as existing light-only status fills and kit outlines;
  it must follow `[data-theme="dark"]`, never an OS media query.
- Use these shared tokens in `src/app/globals.css`, not new per-page palettes:

  | Token                                     | Colour                 | Purpose                                                    |
  | ----------------------------------------- | ---------------------- | ---------------------------------------------------------- |
  | `brand`, `accent`                         | `#204cda`              | Cobalt mastheads, links, active states and primary actions |
  | `brand-strong`                            | `#173bb0`              | Primary-action interaction state                           |
  | `foreground`                              | `#142739`              | Navy text                                                  |
  | `muted`                                   | `#5d6c79`              | Secondary text                                             |
  | `background`, `surface`, `brand-contrast` | `#ffffff`              | White page, controls and text on cobalt                    |
  | `surface-muted`                           | `#f1f4f8`              | Cool-gray fixture tickets and supporting panels            |
  | `border`                                  | `#cbd4df`              | Necessary control and data-grid boundaries                 |
  | `table-row-border`                        | `var(--surface-muted)` | Row outlines matching the card gray (`#f1f4f8`)            |

- Preserve those light-mode values. The dark palette uses:

  | Token                               | Dark value                      |
  | ----------------------------------- | ------------------------------- |
  | `background`                        | `#0c1420`                       |
  | `surface`                           | `#111d2b`                       |
  | `surface-muted`                     | `#1b2b3c`                       |
  | `foreground`                        | `#edf2f8`                       |
  | `muted`                             | `#a5b3c4`                       |
  | `border`                            | `#44556b`                       |
  | `brand`, `brand-strong`             | `#93b0ff`, `#adc2ff`            |
  | `accent`                            | `#a4bdff`                       |
  | `brand-contrast`, `status-contrast` | `#102038`                       |
  | `danger`, `warning`, `success`      | `#ff9999`, `#f5c274`, `#82d8a5` |

- Use `text-status-contrast` on filled success/danger controls and indicators,
  not hard-coded white. Keep text readable on both plain and tinted surfaces.
- Keep semantic danger, warning and success colours for real statuses. Team kit
  colours remain actual registered colours, not brand-colour substitutes.
- Use **Archivo** for body, controls and data; **Archivo Narrow** for compact,
  bold, uppercase page/section headings and the MSSL wordmark. Load through
  `next/font`; use the shared `font-sans`, `font-display` and `font-mono` tokens.
- Preserve the existing home-page structure and content order: league introduction
  and its three actions, announcements, side-by-side Next Fixtures and Latest Results
  (four equal-height cards each), full-width standings snapshot, then Quick Links.
  Retain the "Microsoft Soccer League" title, original copy, and match-card layout.
  Stack the two match lists on mobile. Do not replace this with the preview's fixture
  strip, three-column editorial layout, renamed sections or marketing headlines.
- Apply the approved visual treatment without reorganizing pages or reducing the
  amount of league information shown, unless the user explicitly requests it.
- Prefer square or subtly rounded (2px) surfaces, flat fills and generous spacing
  between compact content groups. No floating-card shadows, oversized hero panels,
  decorative divider lines or pill-shaped navigation. Keep necessary borders on
  inputs, dialogs and calendar grids.
- Use the shared `data-table` class for standings, admin lists and import previews.
  Give every data row a **2px solid card-gray border** around the whole
  row, not individual cells. Reuse `--surface-muted` through `--table-row-border`.
  The border matches the cards in each theme: `#f1f4f8` light, `#1b2b3c` dark.
  Leave header rows unbordered; the first data row supplies the line beneath the
  header. Collapse shared borders so every separator stays 2px, never doubled.
  No row shading, zebra striping, coloured headers or hover fills. Keep the table
  surface on `--surface` and underline or recolour links rather than recolouring rows.
  Calendar date grids retain their functional day-cell boundaries and date states.
- Reuse shared shell, UI, match and table components so all routes remain coherent.
  Keep full team names, kit descriptions, Pacific kickoff times, forfeits,
  disputes, points adjustments and ranking metrics intact. Use live query data,
  never the illustrative dates, scores or matchweek numbers from the preview.

## General constraints

- Do not use emojis in the app, including Unicode escapes and HTML entities.
  Prefer clear text labels. When an icon is needed, use named imports from the
  open-source `lucide-react` library, not emoji glyphs or hand-drawn SVGs.
  Hide decorative icons from assistive technology and preserve each control's
  accessible name.
- Do not use gradients in backgrounds, text, borders, illustrations, or kit
  indicators. Use flat theme colours; show multiple kit colours as separate
  solid-colour elements.
- Use smaller, compact typography throughout public, referee, and admin screens.
  Reuse the shared Tailwind type scale in `src/app/globals.css`: 14px body text,
  13px controls and table text, 12px metadata, and 16-32px headings at the default
  browser font size. Avoid oversized display text and arbitrary font-size overrides.
- Keep the root font size, spacing, control hit areas, and already-small labels
  intact when changing the type scale. Preserve readable line heights, responsive
  layouts, keyboard focus, accessible labels, role-based navigation, working
  filters and announcement dialogs.
