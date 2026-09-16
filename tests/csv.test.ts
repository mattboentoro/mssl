import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("ignores a UTF-8 BOM before the first header", () => {
    expect(parseCsv("\uFEFFmatchweek,kickoff\n1,8/5/2026 17:30")).toEqual([
      ["matchweek", "kickoff"],
      ["1", "8/5/2026 17:30"],
    ]);
  });
});
