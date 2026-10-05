"use client";

import { useEffect, useRef, useState } from "react";

import { inputClass } from "@/components/ui";

interface FilterOption {
  label: string;
  value: string;
}

export function ScrollableFilterSelect({
  label,
  name,
  options,
  placeholder,
  value,
}: {
  label: string;
  name: string;
  options: FilterOption[];
  placeholder: string;
  value: string;
}) {
  const [selected, setSelected] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === selected)?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;

    function close(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="text-sm">
      <span className="text-muted mb-1 block text-xs font-medium uppercase">{label}</span>
      <input type="hidden" name={name} value={selected} />
      <div ref={containerRef} className="relative min-w-48">
        <button
          type="button"
          className={`${inputClass} flex w-full items-center justify-between gap-3 text-left`}
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{selectedLabel}</span>
          <span aria-hidden="true" className="text-muted text-xs">
            ▾
          </span>
        </button>
        {open ? (
          <div
            role="listbox"
            className="border-subtle bg-surface absolute right-0 z-20 mt-1 w-full min-w-max rounded-lg border p-1 shadow-lg"
          >
            <button
              type="button"
              role="option"
              aria-selected={selected === ""}
              className="hover:bg-surface-muted block w-full rounded-md px-3 py-2 text-left"
              onClick={() => {
                setSelected("");
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
            <div className={options.length > 5 ? "max-h-50 overflow-y-auto" : undefined}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected === option.value}
                  className={`hover:bg-surface-muted block w-full rounded-md px-3 py-2 text-left ${
                    selected === option.value ? "bg-brand/10 font-semibold" : ""
                  }`}
                  onClick={() => {
                    setSelected(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
