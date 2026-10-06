"use client";

import { useRef, useState } from "react";

import { KIT_PALETTE, normalizeHex, readableTextOn } from "@/lib/kits";

/**
 * Pick a kit colour from the league's fixed palette.
 *
 * Replaces the browser's free-form `<input type="color">`: administrators
 * choose from a shortlist of basic colours, which keeps kits far enough apart
 * to be told apart from the touchline and makes the clash warning meaningful.
 *
 * The real value travels in a hidden input, so this drops straight into the
 * existing server actions with no change to the form payload.
 */
export function ColorPalettePicker({
  name,
  defaultValue,
  labelledBy,
}: {
  name: string;
  defaultValue: string;
  labelledBy?: string;
}) {
  const [value, setValue] = useState(() => normalizeHex(defaultValue));
  const selected = KIT_PALETTE.find((c) => c.hex === value);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabIndex = Math.max(
    0,
    KIT_PALETTE.findIndex((color) => color.hex === value),
  );

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : "Kit colour"}
        className="border-subtle flex flex-wrap gap-1.5 rounded-lg border p-2"
      >
        {KIT_PALETTE.map((color, index) => {
          const active = color.hex === value;
          return (
            <button
              key={color.hex}
              ref={(button) => {
                buttons.current[index] = button;
              }}
              type="button"
              role="radio"
              tabIndex={index === tabIndex ? 0 : -1}
              aria-checked={active}
              aria-label={color.name}
              title={color.name}
              onClick={() => setValue(color.hex)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === "ArrowRight" || event.key === "ArrowDown")
                  next = (index + 1) % KIT_PALETTE.length;
                else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                  next = (index + KIT_PALETTE.length - 1) % KIT_PALETTE.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = KIT_PALETTE.length - 1;
                else return;
                event.preventDefault();
                setValue(KIT_PALETTE[next].hex);
                buttons.current[next]?.focus();
              }}
              style={{ backgroundColor: color.hex, color: readableTextOn(color.hex) }}
              className={`kit-choice color-swatch h-7 w-7 rounded-full transition ${
                active
                  ? "outline-foreground scale-110 outline-2 outline-offset-1"
                  : "hover:scale-105"
              }`}
            >
              {active ? <span aria-hidden="true">&#10003;</span> : null}
              <span aria-hidden className="forced-colors-label">
                {color.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted mt-1 text-xs">{selected?.name ?? "Custom colour"}</p>
    </div>
  );
}
