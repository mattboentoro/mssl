import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/teams/[id]/logo/route";
import { prisma } from "@/lib/prisma";
import { getTeamLogoStorage } from "@/lib/team-logo-storage";

vi.mock("@/lib/prisma", () => ({
  prisma: { team: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/team-logo-storage", () => ({
  getTeamLogoStorage: vi.fn(),
}));

const findTeam = prisma.team.findFirst as unknown as ReturnType<typeof vi.fn>;
const storageFactory = getTeamLogoStorage as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("controlled team logo reads", () => {
  it("resolves the approved database pointer instead of accepting a blob name", async () => {
    findTeam.mockResolvedValue({
      logoBlobName: "teams/database-approved.png",
      logoContainer: "team-logos",
      logoContentType: "image/png",
      logoEtag: '"etag-1"',
    });
    const read = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    storageFactory.mockReturnValue({ read });

    const response = await GET(new Request("http://localhost/teams/team-1/logo?blob=secret"), {
      params: Promise.resolve({ id: "team-1" }),
    });

    expect(findTeam).toHaveBeenCalledWith({
      where: { OR: [{ id: "team-1" }, { slug: "team-1" }] },
      select: {
        logoBlobName: true,
        logoContainer: true,
        logoContentType: true,
        logoEtag: true,
      },
    });
    expect(read).toHaveBeenCalledWith("teams/database-approved.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects absent, wrong-container, and unapproved content pointers", async () => {
    for (const record of [
      null,
      {
        logoBlobName: "teams/logo.png",
        logoContainer: "public",
        logoContentType: "image/png",
        logoEtag: null,
      },
      {
        logoBlobName: "teams/logo.svg",
        logoContainer: "team-logos",
        logoContentType: "image/svg+xml",
        logoEtag: null,
      },
    ]) {
      findTeam.mockResolvedValueOnce(record);
      const response = await GET(new Request("http://localhost/teams/team-1/logo"), {
        params: Promise.resolve({ id: "team-1" }),
      });
      expect(response.status).toBe(404);
    }
    expect(storageFactory).not.toHaveBeenCalled();
  });

  it("supports ETag conditional reads without touching storage", async () => {
    findTeam.mockResolvedValue({
      logoBlobName: "teams/logo.webp",
      logoContainer: "team-logos",
      logoContentType: "image/webp",
      logoEtag: '"etag-1"',
    });
    const response = await GET(
      new Request("http://localhost/teams/team-1/logo", {
        headers: { "If-None-Match": '"etag-1"' },
      }),
      { params: Promise.resolve({ id: "team-1" }) },
    );
    expect(response.status).toBe(304);
    expect(storageFactory).not.toHaveBeenCalled();
  });
});
