import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Pagination } from "@/components/pagination";
import { ADMIN_PAGE_SIZE, pageHref, pagination } from "@/lib/pagination";

describe("admin pagination", () => {
  it("uses exactly 100 records and includes a partial final page", () => {
    expect(ADMIN_PAGE_SIZE).toBe(100);
    expect(pagination("2", 251)).toEqual({
      page: 2,
      pages: 3,
      skip: 100,
      take: 100,
      total: 251,
      start: 101,
      end: 200,
    });
    expect(pagination("3", 251)).toMatchObject({ skip: 200, start: 201, end: 251 });
    expect(pagination("2", 200)).toMatchObject({ pages: 2, end: 200 });
  });

  it.each([undefined, "", "0", "-1", "1.5", "NaN", "Infinity", "2junk", "1e3"])(
    "safely normalizes invalid page %s",
    (value) => expect(pagination(value, 251)).toMatchObject({ page: 1, skip: 0 }),
  );

  it("clamps beyond the end, very large values, repeated values, and empty results", () => {
    expect(pagination("999", 251).page).toBe(3);
    expect(pagination("9".repeat(400), 251).page).toBe(3);
    expect(pagination(["2", "99"], 251).page).toBe(2);
    expect(pagination("50", 0)).toMatchObject({ page: 1, pages: 1, start: 0, end: 0, skip: 0 });
  });

  it("preserves every filter, search, sort, and repeated query value", () => {
    const params = {
      season: "season id",
      division: "A",
      status: "COMPLETED",
      q: "A&B + C",
      when: "all",
      view: "list",
      month: "2026-10",
      sort: "name-desc",
      tag: ["one", "two"],
      empty: "",
      absent: undefined,
      page: ["2", "3"],
    };
    const url = new URL(pageHref("/admin/matches", params, 1), "https://example.test");
    expect(url.pathname).toBe("/admin/matches");
    expect(url.searchParams.getAll("page")).toEqual(["1"]);
    expect(url.searchParams.getAll("tag")).toEqual(["one", "two"]);
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") expect(url.searchParams.get(key)).toBe(value);
    }
    expect(url.searchParams.has("absent")).toBe(false);
  });

  it("renders labelled navigation, correct ranges, and non-interactive end controls", () => {
    const render = (page: string, total: number) =>
      renderToStaticMarkup(
        createElement(Pagination, {
          basePath: "/admin/discipline",
          params: { season: "fall", sort: "date-desc" },
          range: pagination(page, total),
          label: "Disciplinary records",
        }),
      );
    expect(render("2", 251)).toContain('aria-label="Disciplinary records pagination"');
    expect(render("2", 251)).toContain("Showing 101\u2013200 of 251 disciplinary records");
    expect(render("2", 251)).toContain('rel="prev"');
    expect(render("2", 251)).toContain('rel="next"');
    expect(render("1", 251)).not.toContain('rel="prev"');
    expect(render("3", 251)).not.toContain('rel="next"');
    expect(render("1", 0)).toContain("Showing 0\u20130 of 0 disciplinary records");
    expect(render("1", 0).match(/aria-disabled="true"/g)).toHaveLength(2);
    expect(render("1", 0)).not.toContain("<a ");
  });
});
