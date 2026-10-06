// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { importScheduleAction, type CsvImportState } from "@/app/admin/actions";
import { ScheduleImportForm } from "@/components/schedule-import-form";
import { ScrollableFilterSelect } from "@/components/scrollable-filter-select";
import { formatDateTime } from "@/lib/dates";

const { closeDialog } = vi.hoisted(() => ({ closeDialog: vi.fn() }));
vi.mock("@/app/admin/actions", () => ({ importScheduleAction: vi.fn() }));
vi.mock("@/components/form-dialog", () => ({ useDialogClose: () => closeDialog }));
vi.mock("@/lib/dates", async (importOriginal) => {
  const dates = await importOriginal<typeof import("@/lib/dates")>();
  return { ...dates, formatDateTime: vi.fn(dates.formatDateTime) };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function element<T extends Element>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing test element: ${selector}`);
  return found;
}

async function click(selector: string) {
  await act(async () => element<HTMLButtonElement>(selector).click());
}

const seasons = [
  { id: "spring", name: "Spring" },
  { id: "summer", name: "Summer" },
];
const csv = "matchweek,kickoff,division,home,away\n1,2026-03-07 18:00,Premier,Home,Away";

function preview(count = 100): CsvImportState {
  return {
    csv,
    seasonId: "spring",
    ok: "Dry run ready",
    validCount: count,
    duplicateCount: 0,
    errorCount: 0,
    rows: Array.from({ length: count }, (_, index) => ({
      line: index + 2,
      raw: {},
      resolved: {
        divisionId: "premier",
        divisionName: "Premier",
        homeTeamId: "home",
        homeTeamName: "Home",
        awayTeamId: "away",
        awayTeamName: "Away",
        venueName: "Park",
        kickoffAt: "2026-03-08T02:00:00.000Z",
        matchweek: String(index + 1),
        countsForStandings: true,
        duplicate: false,
      },
    })),
  };
}

async function mountImport() {
  await act(() => root.render(createElement(ScheduleImportForm, { seasons })));
  element<HTMLTextAreaElement>("textarea").value = csv;
  vi.mocked(importScheduleAction).mockResolvedValueOnce(preview());
  await click('button[value="dry-run"]');
  expect(container.querySelectorAll("tbody tr")).toHaveLength(100);
  vi.mocked(formatDateTime).mockClear();
}

describe("schedule import render isolation", () => {
  it("does not rebuild preview rows on season changes or CSV file loads", async () => {
    await mountImport();
    const textarea = element<HTMLTextAreaElement>("textarea");
    const firstRow = element("tbody tr");
    const select = element<HTMLSelectElement>('select[name="seasonId"]');
    await act(() => {
      select.value = "summer";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(new FormData(element<HTMLFormElement>("form")).get("seasonId")).toBe("summer");
    expect(formatDateTime).not.toHaveBeenCalled();

    const upload = element<HTMLInputElement>('input[type="file"]');
    const uploadedCsv = csv.replace("Home", "New home");
    Object.defineProperty(upload, "files", {
      value: [new File([uploadedCsv], "fixtures.csv", { type: "text/csv" })],
    });
    await act(async () => {
      upload.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.waitFor(() => expect(textarea.value).toBe(uploadedCsv));
    });
    expect(container.textContent).toContain("Loaded fixtures.csv");
    expect(formatDateTime).not.toHaveBeenCalled();
    expect(element("textarea")).toBe(textarea);
    expect(element("tbody tr")).toBe(firstRow);
    expect(closeDialog).not.toHaveBeenCalled();

    vi.mocked(importScheduleAction).mockResolvedValueOnce(preview(1));
    await click('button[value="dry-run"]');
    const submitted = vi.mocked(importScheduleAction).mock.calls.at(-1)?.[1];
    expect(submitted?.get("csv")).toBe(uploadedCsv);
    expect(submitted?.get("seasonId")).toBe("summer");
    expect(submitted?.get("mode")).toBe("dry-run");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(formatDateTime).toHaveBeenCalled();
    expect(element('select[name="seasonId"]')).toBe(select);
  });

  it("retains validation feedback and pending controls while the action resolves", async () => {
    await mountImport();
    let resolve!: (state: CsvImportState) => void;
    vi.mocked(importScheduleAction).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await click('button[value="dry-run"]');
    expect(element<HTMLButtonElement>('button[value="dry-run"]').disabled).toBe(true);
    expect(element<HTMLButtonElement>('button[value="commit"]').disabled).toBe(true);
    await act(async () => resolve({ error: "Invalid CSV", csv, seasonId: "spring" }));
    expect(container.textContent).toContain("Invalid CSV");
    expect(element<HTMLButtonElement>('button[value="dry-run"]').disabled).toBe(false);
    expect(element<HTMLTextAreaElement>("textarea").value).toBe(csv);
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it("still requires confirmation and closes only after a committed import", async () => {
    await mountImport();
    const dialog = element<HTMLDialogElement>("dialog");
    dialog.showModal = vi.fn();
    const callsBefore = vi.mocked(importScheduleAction).mock.calls.length;
    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Import valid rows" && button.type === "button",
    );
    expect(trigger).toBeDefined();
    await act(() => trigger?.click());
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(importScheduleAction).toHaveBeenCalledTimes(callsBefore);
    vi.mocked(importScheduleAction).mockResolvedValueOnce({ ...preview(), committed: true });
    await click('button[value="commit"]');
    expect(vi.mocked(importScheduleAction).mock.calls.at(-1)?.[1].get("mode")).toBe("commit");
    expect(closeDialog).toHaveBeenCalledOnce();
  });
});

describe("filter popover subscriptions", () => {
  const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());

  async function mountFilter() {
    await act(() =>
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(
            "form",
            { onSubmit: submit },
            createElement(ScrollableFilterSelect, {
              label: "Venue",
              name: "venue",
              options: [{ label: "Park", value: "park" }],
              placeholder: "All venues",
              value: "",
            }),
            createElement("button", { type: "submit" }, "Apply"),
          ),
        ),
      ),
    );
  }

  it("subscribes only while open and removes the same listeners on close and unmount", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const relevant = (type: string) => type === "pointerdown" || type === "keydown";
    await mountFilter();
    expect(add.mock.calls.filter(([type]) => relevant(type))).toHaveLength(0);
    await click('button[aria-haspopup="listbox"]');
    const listeners = add.mock.calls.filter(([type]) => relevant(type));
    expect(listeners).toHaveLength(2);
    await act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(element("button[aria-haspopup]").getAttribute("aria-expanded")).toBe("false");
    for (const [type, listener] of listeners) {
      expect(remove).toHaveBeenCalledWith(type, listener);
    }
    await click('button[aria-haspopup="listbox"]');
    expect(add.mock.calls.filter(([type]) => relevant(type))).toHaveLength(4);
    await act(() => root.render(null));
    expect(remove.mock.calls.filter(([type]) => relevant(type))).toHaveLength(4);
  });

  it("preserves inside clicks, selection, explicit form submission, and outside-click dismissal", async () => {
    await mountFilter();
    await click("button[aria-haspopup]");
    await act(() =>
      element('[role="listbox"]').dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await click('[role="option"]:last-child');
    expect(element<HTMLInputElement>('input[name="venue"]').value).toBe("park");
    expect(element("button[aria-haspopup]").textContent).toContain("Park");
    expect(new FormData(element<HTMLFormElement>("form")).get("venue")).toBe("park");
    expect(submit).not.toHaveBeenCalled();
    await click('button[type="submit"]');
    expect(submit).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await click("button[aria-haspopup]");
    expect(element('[role="option"][aria-selected="true"]').textContent).toBe("Park");
    await act(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await click("button[aria-haspopup]");
    await click('[role="option"]');
    expect(element<HTMLInputElement>('input[name="venue"]').value).toBe("");
    expect(element<HTMLButtonElement>("button[aria-haspopup]").type).toBe("button");
  });
});
