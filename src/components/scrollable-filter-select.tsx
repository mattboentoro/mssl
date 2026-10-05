"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

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
  const [activeIndex, setActiveIndex] = useState(0);
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef({ text: "", time: 0 });
  const choices = [{ label: placeholder, value: "" }, ...options];
  const selectedLabel = options.find((option) => option.value === selected)?.label ?? placeholder;

  function show(
    index = Math.max(
      0,
      choices.findIndex((option) => option.value === selected),
    ),
  ) {
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(index: number) {
    setSelected(choices[index].value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      if (open) {
        setSelected(choices[activeIndex].value);
        setOpen(false);
      }
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Home") show(0);
      else if (event.key === "End") show(choices.length - 1);
      else if (!open) show();
      else if (event.key === "Enter" || event.key === " ") choose(activeIndex);
      else
        setActiveIndex((index) =>
          Math.max(0, Math.min(choices.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))),
        );
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text =
        (now - searchRef.current.time < 500 ? searchRef.current.text : "") +
        event.key.toLowerCase();
      searchRef.current = { text, time: now };
      const prefix = [...text].every((letter) => letter === text[0]) ? text[0] : text;
      const start = open
        ? activeIndex
        : Math.max(
            0,
            choices.findIndex((option) => option.value === selected),
          );
      const index = choices.findIndex((_, offset) =>
        choices[(start + offset + 1) % choices.length].label.toLowerCase().startsWith(prefix),
      );
      if (index >= 0) {
        event.preventDefault();
        show((start + index + 1) % choices.length);
      }
    }
  }

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, id, open]);

  useEffect(() => {
    if (!open) return;

    function close(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
      <span id={`${id}-label`} className="text-muted mb-1 block text-xs font-medium uppercase">
        {label}
      </span>
      <input type="hidden" name={name} value={selected} />
      <div ref={containerRef} className="relative min-w-48">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          className={`${inputClass} flex w-full items-center justify-between gap-3 text-left`}
          aria-labelledby={`${id}-label`}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            if (!containerRef.current?.contains(event.relatedTarget)) setOpen(false);
          }}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span className="truncate">{selectedLabel}</span>
          <span aria-hidden="true" className="text-muted text-xs">
            ▾
          </span>
        </button>
        {open ? (
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="border-control bg-surface absolute right-0 z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border p-1 shadow-lg"
          >
            {choices.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={`hover:bg-surface-muted block h-10 w-full truncate rounded-md px-3 py-2 text-left leading-6 ${
                  activeIndex === index
                    ? "bg-brand/10 outline-brand font-semibold outline-2 -outline-offset-2"
                    : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                {option.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
