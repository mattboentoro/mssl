# MSSL UI instructions

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
  intact. Preserve readable line heights, responsive layouts, keyboard focus,
  and accessible labels.
