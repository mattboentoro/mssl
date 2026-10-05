// @vitest-environment jsdom

import axe from "axe-core";
import { act, createElement as h, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { Dialog } from "@/components/form-dialog";
import { PageSkeleton } from "@/components/loading";
import { ActionButton } from "@/components/match-actions";
import { MatchDisclosureHint, MatchKitColors, MatchScore } from "@/components/match-display";
import { RescheduleProposalForm } from "@/components/reschedule-forms";
import { ScrollableFilterSelect } from "@/components/scrollable-filter-select";
import { SiteHeader } from "@/components/site-header";
import { KitSwatch, TeamColorBar, TeamKitLegend } from "@/components/team-colors";
import { TeamLogo } from "@/components/team-logo";
import { Alert, Badge, Button, Field, FormGuide } from "@/components/ui";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import type { ActionState } from "@/app/admin/actions";
import { KIT_PALETTE } from "@/lib/kits";

vi.mock("next/navigation", () => ({
  usePathname: () => "/schedule",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/captain/reschedules/actions", () => ({
  proposeRescheduleAction: vi.fn(async () => ({})),
  reviseRescheduleAction: vi.fn(async () => ({})),
  cancelRescheduleAction: vi.fn(async () => ({})),
  respondToRescheduleAction: vi.fn(async () => ({})),
}));

let container: HTMLDivElement;
let root: Root;
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
  this.querySelector<HTMLElement>("button, input, textarea")?.focus();
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
  this.dispatchEvent(new Event("close"));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Only model lifecycle events. Native inertness/Tab containment needs a browser.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: showModal },
    close: { configurable: true, value: close },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

async function render(node: ReactNode) {
  await act(async () => root.render(node));
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

async function key(target: HTMLElement, value: string, shiftKey = false) {
  await act(async () =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }),
    ),
  );
}

async function escape(dialog: HTMLDialogElement) {
  let allowed = false;
  await act(async () => {
    allowed = dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    if (allowed) dialog.close();
  });
  return allowed;
}

async function checkAxe(scope: HTMLElement = container) {
  const result = await axe.run(scope, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  expect(
    result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}

describe("keyboard-operated filter and kit controls", () => {
  it("navigates, scrolls, commits or cancels a named combobox without submitting the form", async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    await render(
      h(
        "form",
        { onSubmit: submit },
        h(ScrollableFilterSelect, {
          label: "Venue",
          name: "venue",
          value: "park",
          placeholder: "All venues",
          options: ["Park", "Redmond", "School", "Stadium", "Union", "Valley"].map((label) => ({
            label,
            value: label.toLowerCase(),
          })),
        }),
        h("button", { type: "submit" }, "Apply"),
      ),
    );
    const trigger = element<HTMLButtonElement>('[role="combobox"]');
    trigger.focus();
    await key(trigger, "ArrowDown");
    expect(document.activeElement).toBe(trigger);
    expect(element('[role="option"][aria-selected="true"]').textContent).toBe("Park");
    expect(element('[role="listbox"]').className).toContain("max-h-52");
    expect(container.querySelectorAll('[role="option"][tabindex="0"]')).toHaveLength(0);
    await key(trigger, "End");
    const active = element('[role="option"][aria-selected="true"]');
    expect(active.textContent).toBe("Valley");
    expect(trigger.getAttribute("aria-activedescendant")).toBe(active.id);
    await checkAxe();
    await key(trigger, "Escape");
    expect(element<HTMLInputElement>('input[name="venue"]').value).toBe("park");
    expect(document.activeElement).toBe(trigger);
    await key(trigger, " ");
    await key(trigger, "Home");
    await key(trigger, "ArrowDown");
    await key(trigger, "ArrowDown");
    await key(trigger, "Enter");
    expect(element<HTMLInputElement>('input[name="venue"]').value).toBe("redmond");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await key(trigger, "v");
    expect(element('[role="option"][aria-selected="true"]').textContent).toBe("Valley");
    await key(trigger, "Tab");
    expect(new FormData(element<HTMLFormElement>("form")).get("venue")).toBe("valley");
    expect(submit).not.toHaveBeenCalled();
    await click(element('button[type="submit"]'));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("provides a correctly labeled, one-tab-stop radio palette with wraparound and unchanged payload", async () => {
    await render(
      h(
        "form",
        null,
        h(Field, {
          group: true,
          label: "Home kit",
          htmlFor: "home-kit",
          children: h(ColorPalettePicker, {
            name: "colorPrimary",
            defaultValue: KIT_PALETTE[0].hex,
            labelledBy: "home-kit",
          }),
        }),
      ),
    );
    const radios = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(
      document.getElementById(element('[role="radiogroup"]').getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe("Home kit");
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    radios[0].focus();
    await key(radios[0], "ArrowLeft");
    expect(document.activeElement).toBe(radios.at(-1));
    expect(radios.at(-1)?.getAttribute("aria-checked")).toBe("true");
    await key(radios.at(-1)!, "Home");
    await key(radios[0], "ArrowDown");
    expect(document.activeElement).toBe(radios[1]);
    expect(Array.from(new FormData(element<HTMLFormElement>("form")).entries())).toEqual([
      ["colorPrimary", KIT_PALETTE[1].hex],
    ]);
    expect(radios[1].querySelector(".forced-colors-label")?.textContent).toBe(KIT_PALETTE[1].name);
    await checkAxe();
  });
});

describe("native dialog lifecycle and safe confirmation", () => {
  it("restores nested dialog focus without resetting its parent's unsaved fields", async () => {
    await render(
      h(Dialog, {
        trigger: "Outer",
        title: "Outer",
        children: h(
          Fragment,
          null,
          h(
            "label",
            null,
            "Unsaved name",
            h("input", { id: "unsaved-name", defaultValue: "Original" }),
          ),
          h(Dialog, { trigger: "Inner", title: "Inner", children: h("p", null, "Confirmation") }),
        ),
      }),
    );
    await click(element("button"));
    const input = element<HTMLInputElement>("#unsaved-name");
    input.value = "Changed";
    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Inner",
    )!;
    trigger.focus();
    await click(trigger);
    await escape(element<HTMLDialogElement>("dialog dialog"));
    expect(element<HTMLDialogElement>("dialog").open).toBe(true);
    expect(element<HTMLInputElement>("#unsaved-name").value).toBe("Changed");
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab at both modal edges, excluding hidden, disabled and negative-tab-index controls", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
      this: HTMLElement,
    ) {
      return Object.assign(this.hidden ? [] : [new DOMRect()], { item: () => new DOMRect() });
    });
    await render(
      h(Dialog, {
        trigger: "Edit",
        title: "Edit",
        children: h(
          Fragment,
          null,
          h("button", { hidden: true }, "Hidden"),
          h("button", { disabled: true }, "Disabled"),
          h("button", { tabIndex: -1 }, "Not in tab order"),
          h("button", { id: "last-control" }, "Last"),
        ),
      }),
    );
    await click(element("button"));
    const first = element<HTMLButtonElement>("dialog button");
    const last = element<HTMLButtonElement>("#last-control");
    last.focus();
    await key(last, "Tab");
    expect(document.activeElement).toBe(first);
    await key(first, "Tab", true);
    expect(document.activeElement).toBe(last);
  });

  it("opens modally, links its description, restores focus after Escape, and resets form content", async () => {
    await render(
      h(Dialog, {
        trigger: "Edit",
        title: "Edit team",
        description: "Change club details.",
        children: h("label", null, "Name", h("input", { defaultValue: "Original" })),
      }),
    );
    const trigger = element<HTMLButtonElement>("button");
    trigger.focus();
    await click(trigger);
    const dialog = element<HTMLDialogElement>("dialog");
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Change club details.",
    );
    const input = element<HTMLInputElement>("input");
    input.value = "Unsaved";
    await checkAxe(dialog);
    expect(await escape(dialog)).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await click(trigger);
    expect(element<HTMLInputElement>("input").value).toBe("Original");
  });

  it("focuses the safe action and blocks Escape while a server-action confirmation is pending", async () => {
    let resolve!: (result: ActionState) => void;
    const action = vi.fn(
      () =>
        new Promise<ActionState>((done) => {
          resolve = done;
        }),
    );
    await render(
      h(ActionForm, {
        action,
        children: h(SubmitButton, {
          confirm: "Delete this team?",
          variant: "danger",
          children: "Delete",
        }),
      }),
    );
    const trigger = element<HTMLButtonElement>('button[type="button"]');
    trigger.focus();
    await click(trigger);
    const dialog = element<HTMLDialogElement>("dialog");
    expect(document.activeElement?.textContent).toBe("Keep");
    expect(action).not.toHaveBeenCalled();
    await click(element('button[type="submit"]'));
    expect(await escape(dialog)).toBe(false);
    expect(dialog.open).toBe(true);
    await act(async () => resolve({ error: "Unable to delete" }));
    expect(await escape(dialog)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps mutation confirmations open during requests and permits safe cancellation after an error", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    await render(
      h(ActionButton, { url: "/api/example", label: "Release", confirm: "Release this fixture?" }),
    );
    const trigger = element<HTMLButtonElement>("button");
    trigger.focus();
    await click(trigger);
    const dialog = element<HTMLDialogElement>("dialog");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await click(element("dialog button:last-child"));
    expect(await escape(dialog)).toBe(false);
    await act(async () =>
      resolve(new Response(JSON.stringify({ error: "Conflict" }), { status: 409 })),
    );
    expect(element("dialog [role=alert]").textContent).toBe("Conflict");
    expect(await escape(dialog)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("does not intercept the skip link and keeps unsaved edits on Escape", async () => {
    await render(
      h(
        Fragment,
        null,
        h("a", { href: "#main", onClick: (event) => event.preventDefault() }, "Skip"),
        h("a", { href: "/teams" }, "Teams"),
        h("main", { id: "main", tabIndex: -1 }, "Content"),
        h(UnsavedChangesGuard, { enabled: true }),
      ),
    );
    await click(element('a[href="#main"]'));
    expect(showModal).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("main");
    expect(window.location.hash).toBe("");
    const link = element('a[href="/teams"]');
    link.focus();
    await click(link);
    const dialog = element<HTMLDialogElement>("dialog");
    expect(dialog.open).toBe(true);
    expect(document.activeElement?.textContent).toBe("Keep editing");
    expect(await escape(dialog)).toBe(false);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(link);
    await click(link);
    expect(dialog.open).toBe(true);
  });
});

describe("names, descriptions and non-text values", () => {
  it("uses the stronger shared bar boundary without changing kit colors, compact sizes or decorative semantics", async () => {
    for (const [primary, alternate] of [
      ["#ffffff", "#f8fafc"],
      ["#000000", "#111111"],
    ]) {
      for (const [size, dimensions] of [
        ["sm", ["h-4", "w-1.5"]],
        ["md", ["h-6", "w-2"]],
        ["lg", ["h-9", "w-2.5"]],
      ] as const) {
        await render(
          h(TeamColorBar, { team: { colorPrimary: primary, colorAlternate: alternate }, size }),
        );
        const bar = element(".team-color-bar");
        expect(bar.getAttribute("aria-hidden")).toBe("true");
        expect(bar.classList.contains("color-swatch")).toBe(false);
        for (const dimension of dimensions) expect(bar.classList.contains(dimension)).toBe(true);
        expect(bar.getAttribute("style")).toContain(
          `${primary} 0%, ${primary} 50%, ${alternate} 50%, ${alternate} 100%`,
        );
        expect(bar.textContent).toBe("");
      }
    }
  });

  it("preserves input identity and unsaved values when a hint appears or disappears", async () => {
    const field = (hint?: string) =>
      h(Field, {
        label: "Name",
        htmlFor: "stable-name",
        hint,
        children: h("input", { id: "stable-name", defaultValue: "Original" }),
      });
    await render(field());
    const input = element<HTMLInputElement>("input");
    input.value = "Unsaved";
    await render(field("A new hint"));
    expect(element("input")).toBe(input);
    expect(input.value).toBe("Unsaved");
    expect(input.getAttribute("aria-describedby")).toBe("stable-name-hint");
    await render(field());
    expect(element("input")).toBe(input);
    expect(input.value).toBe("Unsaved");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("associates required labels, nested hints and action errors, then removes stale invalid state", async () => {
    const action = vi.fn(async (): Promise<ActionState> => ({
      error: "Check fields",
      fieldErrors: { email: "Email is unavailable" },
    }));
    await render(
      h(ActionForm, {
        action,
        resetOnSuccess: false,
        children: h(
          Fragment,
          null,
          h(Field, {
            label: "Email",
            htmlFor: "email",
            hint: "Use a contact address.",
            children: [
              h(
                "div",
                { key: "input" },
                h("input", {
                  id: "email",
                  name: "email",
                  required: true,
                  defaultValue: "test@example.com",
                }),
              ),
              h(FieldError, { key: "error", name: "email" }),
            ],
          }),
          h(SubmitButton, { children: "Save" }),
        ),
      }),
    );
    const input = element<HTMLInputElement>("input");
    expect(input.labels?.[0].textContent).toContain("Email");
    expect(input.getAttribute("aria-describedby")).toBe("email-hint");
    await click(element('button[type="submit"]'));
    const error = element("p[id][role=alert]");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    await checkAxe();
    action.mockResolvedValueOnce({});
    await click(element('button[type="submit"]'));
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("email-hint");
  });

  it("gives concurrently mounted reschedule forms distinct label/control IDs", async () => {
    await render(
      h(
        Fragment,
        null,
        ...["one", "two"].map((id) =>
          h(RescheduleProposalForm, {
            key: id,
            fixture: { id, requestingTeamId: id, label: `Fixture ${id}` },
            slots: [{ id: "same", label: "Same slot" }],
          }),
        ),
      ),
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const control of container.querySelectorAll<HTMLSelectElement | HTMLTextAreaElement>(
      "select,textarea",
    ))
      expect(control.labels).toHaveLength(1);
    await checkAxe();
  });

  it("names meaningful kits and scores, hides duplicate logos and chevrons, and exposes result words", async () => {
    const team = {
      id: "home",
      name: "Home",
      slug: "home",
      shortName: "H",
      colorPrimary: "#ffffff",
      colorAlternate: "#000000",
    };
    await render(
      h(
        "main",
        null,
        h("h1", null, "Fixtures"),
        h(KitSwatch, { team, kit: "PRIMARY", teamName: team.name }),
        h(TeamKitLegend, { team }),
        h(KitSwatch, { team, kit: "PRIMARY", teamName: team.name, decorative: true }),
        h(TeamLogo, { teamId: team.id, name: team.name, hasLogo: false, decorative: true }),
        h(MatchScore, { home: 2, away: 1, homeColor: "#ffffff", awayColor: "#000000" }),
        h(MatchKitColors, {
          homeTeam: team,
          awayTeam: { ...team, id: "away", name: "Away" },
          homeKit: "PRIMARY",
          awayKit: "ALTERNATE",
        }),
        h(FormGuide, { form: ["W", "D", "L"] }),
        h(
          "details",
          null,
          h("summary", null, "Match details", h(MatchDisclosureHint)),
          h("p", null, "Details"),
        ),
        h(Alert, { tone: "success", children: "Saved" }),
        h(Badge, { tone: "danger", children: "Suspended" }),
        h(Button, { variant: "danger", disabled: true }, "Delete"),
      ),
    );
    expect(element('[role="img"][aria-label="Primary kit: white"]')).toBeTruthy();
    expect(element('[role="img"][aria-label="Home kit: White; away kit: Black"]')).toBeTruthy();
    expect(Array.from(container.querySelectorAll("dl dt")).map((term) => term.textContent)).toEqual(
      ["Primary kit", "Alternate kit"],
    );
    expect(container.querySelectorAll('[aria-label*="Expand"]')).toHaveLength(0);
    expect(container.textContent).toContain("Home kit: White; away kit: Black");
    expect(container.textContent).toContain("Win");
    expect(container.textContent).toContain("Draw");
    expect(container.textContent).toContain("Loss");
    expect(element('[role="status"]').textContent).toBe("Saved");
    const details = element<HTMLDetailsElement>("details");
    await click(element("summary"));
    expect(details.open).toBe(true);
    await click(element("summary"));
    expect(details.open).toBe(false);
    await checkAxe();
  });

  it("keeps navigation and account names concise, supports menu Escape, and provides a focusable skip target", async () => {
    await render(
      h(
        Fragment,
        null,
        h(SiteHeader, {
          user: {
            name: "Alex",
            email: null,
            isReferee: false,
            isAdmin: true,
            isPlayer: false,
            isCaptain: false,
            isDevBypass: false,
            canSignUpAsFreeAgent: false,
            unreadNotifications: 2,
          },
        }),
        h("main", { id: "main", tabIndex: -1 }, h("h1", null, "Schedule")),
      ),
    );
    const trigger = element<HTMLButtonElement>('button[aria-controls="mobile-nav"]');
    await click(trigger);
    const link = element<HTMLAnchorElement>("#mobile-nav a");
    link.focus();
    await key(link, "Escape");
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(element('a[href="/account"]').getAttribute("aria-label")).toBe(
      "Account: Alex — Admin, 2 unread notifications",
    );
    expect(element('a[href="#main"]').textContent).toBe("Skip to content");
    element("main").focus();
    expect(document.activeElement?.id).toBe("main");
    await checkAxe();
  });

  it("keeps loading shapes hidden and exposes one useful loading status", async () => {
    await render(h(PageSkeleton, { title: "Schedule", filters: true, sections: 2 }));
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(element('[role="status"]').textContent).toContain("Loading schedule");
    for (const skeleton of container.querySelectorAll(".motion-safe\\:animate-pulse"))
      expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    await checkAxe();
  });
});
