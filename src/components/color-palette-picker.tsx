"use client";

import { Check } from "lucide-react";
import { useState } from "react";

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

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        className="border-subtle flex flex-wrap gap-1.5 rounded-lg border p-2"
      >
        {KIT_PALETTE.map((color) => {
          const active = color.hex === value;
          return (
            <button
              key={color.hex}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={color.name}
              title={color.name}
              onClick={() => setValue(color.hex)}
              style={{ backgroundColor: color.hex, color: readableTextOn(color.hex) }}
              className={`focus-visible:ring-accent h-7 w-7 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                active ? "border-fg scale-110 border-2" : "border-subtle hover:scale-105"
              }`}
            >
              {active ? <Check aria-hidden="true" size={16} className="mx-auto" /> : null}
            </button>
          );
        })}
      </div>
      <p className="text-muted mt-1 text-xs">{selected?.name ?? "Custom colour"}</p>
    </div>
  );
}
