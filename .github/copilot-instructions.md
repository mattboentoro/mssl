# MSSL UI instructions

## Selected direction: Matchday with Touchline colours

- Use **Matchday's match-programme typography and styling** with **Touchline's cobalt palette**.
  This is the approved site direction, not a choice between the two previews.
  The reference is `public/design-directions.html`: Matchday supplies the
  typographic character and flat surfaces; Touchline supplies the colours.
  The preview is a visual reference, not permission to replace existing page layouts.
- Keep the site light-only, including public, referee and admin screens.
  Do not restore a dark-mode toggle, OS theme switching, or a stored-theme script.
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
  Give every data row a **2px solid card-gray (`#f1f4f8`) border** around the whole
  row, not individual cells. Reuse `--surface-muted` through `--table-row-border`.
  Leave header rows unbordered; the first data row supplies the line beneath the
  header. Collapse shared borders so every separator stays 2px, never doubled.
  No row shading, zebra striping, coloured headers or hover fills. Keep the table
  surface white and underline or recolour links rather than recolouring rows.
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
