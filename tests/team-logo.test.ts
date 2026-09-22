import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  generateTeamLogoBlobName,
  MAX_TEAM_LOGO_BYTES,
  validateTeamLogo,
  type TeamLogoStorage,
} from "@/lib/team-logo-storage";
import { deleteTeamLogo, replaceTeamLogo, type TeamLogoPersistence } from "@/lib/team-profile";

vi.mock("server-only", () => ({}));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBP");

describe("team logo validation", () => {
  it.each([
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/webp", webp],
  ] as const)("accepts valid %s magic bytes", (contentType, bytes) => {
    expect(validateTeamLogo(bytes, contentType)).toBe(contentType);
  });

  it("rejects empty, oversized, unsupported, and MIME-spoofed files", () => {
    expect(() => validateTeamLogo(new Uint8Array(), "image/png")).toThrow("non-empty");
    expect(() => validateTeamLogo(new Uint8Array(MAX_TEAM_LOGO_BYTES + 1), "image/png")).toThrow(
      "2 MiB",
    );
    expect(() => validateTeamLogo(png, "image/gif")).toThrow("PNG, JPEG, or WebP");
    expect(() => validateTeamLogo(jpeg, "image/png")).toThrow("do not match");
  });

  it("generates opaque names with an extension derived from validated content", () => {
    expect(generateTeamLogoBlobName("image/png", () => "generated-id")).toBe(
      "teams/generated-id.png",
    );
    expect(generateTeamLogoBlobName("image/jpeg", () => "generated-id")).toBe(
      "teams/generated-id.jpg",
    );
    expect(generateTeamLogoBlobName("image/webp", () => "generated-id")).toBe(
      "teams/generated-id.webp",
    );
  });
});

describe("team logo replacement lifecycle", () => {
  function fixtures() {
    const events: string[] = [];
    const storage: TeamLogoStorage = {
      async upload(blobName, _bytes, contentType) {
        events.push(`upload:${blobName}`);
        return { blobName, container: "team-logos", contentType, etag: "new-etag" };
      },
      async delete(blobName) {
        events.push(`delete:${blobName}`);
      },
      async read() {
        return null;
      },
    };
    const persistence: TeamLogoPersistence = {
      async commitReplacement() {
        events.push("commit");
        return {
          blobName: "teams/old.png",
          container: "team-logos",
          contentType: "image/png",
          etag: "old-etag",
        };
      },
      async commitDeletion() {
        events.push("clear");
        return {
          blobName: "teams/old.png",
          container: "team-logos",
          contentType: "image/png",
          etag: "old-etag",
        };
      },
    };
    return { events, storage, persistence };
  }

  it("uploads new, commits the pointer and audit transaction, then deletes old", async () => {
    const { events, storage, persistence } = fixtures();
    await replaceTeamLogo({
      teamId: "team-1",
      bytes: png,
      contentType: "image/png",
      actor: { id: "actor" },
      storage,
      persistence,
      randomId: () => "new",
    });
    expect(events).toEqual(["upload:teams/new.png", "commit", "delete:teams/old.png"]);
  });

  it("compensates by deleting the new blob when the database transaction fails", async () => {
    const { events, storage, persistence } = fixtures();
    persistence.commitReplacement = async () => {
      events.push("commit");
      throw new Error("database failed");
    };

    await expect(
      replaceTeamLogo({
        teamId: "team-1",
        bytes: png,
        contentType: "image/png",
        actor: { id: "actor" },
        storage,
        persistence,
        randomId: () => "new",
      }),
    ).rejects.toThrow("database failed");
    expect(events).toEqual(["upload:teams/new.png", "commit", "delete:teams/new.png"]);
  });

  it("reports compensation and old-blob cleanup failures explicitly", async () => {
    const { storage, persistence } = fixtures();
    persistence.commitReplacement = async () => {
      throw new Error("database failed");
    };
    storage.delete = async () => {
      throw new Error("storage offline");
    };
    await expect(
      replaceTeamLogo({
        teamId: "team-1",
        bytes: png,
        contentType: "image/png",
        actor: { id: "actor" },
        storage,
        persistence,
      }),
    ).rejects.toThrow("cleanup of the new blob also failed: storage offline");

    const second = fixtures();
    second.storage.delete = async () => {
      throw new Error("storage offline");
    };
    await expect(
      replaceTeamLogo({
        teamId: "team-1",
        bytes: png,
        contentType: "image/png",
        actor: { id: "actor" },
        storage: second.storage,
        persistence: second.persistence,
      }),
    ).rejects.toThrow("previous blob could not be deleted: storage offline");
  });

  it("clears the database pointer before deleting the old blob", async () => {
    const { events, storage, persistence } = fixtures();
    await deleteTeamLogo({ teamId: "team-1", actor: { id: "actor" }, storage, persistence });
    expect(events).toEqual(["clear", "delete:teams/old.png"]);
  });
});

describe("credential isolation", () => {
  it("keeps storage credentials and the Azure SDK out of client components", async () => {
    const component = await readFile("src/components/team-profile-form.tsx", "utf8");
    expect(component).not.toContain("process.env");
    expect(component).not.toContain("@azure/storage-blob");
    expect(component).not.toContain("AZURE_STORAGE_CONNECTION_STRING");
  });
});
