import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { GET as getPersonalCalendar } from "@/app/calendar.ics/route";
import { GET as getMatchCalendar } from "@/app/matches/[id]/calendar.ics/route";
import { GET as getTeamCalendar } from "@/app/teams/[id]/calendar.ics/route";
import { foldIcalLine, serializeCalendar, type CalendarMatch } from "@/lib/ical";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const prisma = new PrismaClient();
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.refereeRating.deleteMany();
  await prisma.scoreAppeal.deleteMany();
  await prisma.captainResultProposal.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.rosterJoinRequest.deleteMany();
  await prisma.rosterInvitation.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.teamCaptain.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.disciplinaryAction.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.seasonTeam.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.appUser.deleteMany();
  mockedAuth.mockReset();
}

function calendarMatch(overrides: Partial<CalendarMatch> = {}): CalendarMatch {
  return {
    id: "match-stable",
    kickoffAt: new Date("2026-09-22T01:30:00Z"),
    updatedAt: new Date("2026-09-01T12:00:00Z"),
    version: 2,
    status: "SCHEDULED",
    matchweek: "4",
    venueName: "Pitch 1",
    homeTeam: { name: "Home" },
    awayTeam: { name: "Away" },
    division: { name: "Premier" },
    referee: null,
    report: null,
    ...overrides,
  };
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Calendar Season",
      slug: "calendar-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
      isActive: true,
    },
  });
  const division = await prisma.division.create({
    data: { name: "Calendar Division", slug: "calendar-division" },
  });
  const teams = await Promise.all(
    ["Alpha", "Bravo", "Charlie", "Delta"].map((name) =>
      prisma.team.create({
        data: {
          divisionId: division.id,
          name,
          slug: name.toLowerCase(),
          shortName: name.slice(0, 3).toUpperCase(),
        },
      }),
    ),
  );
  const makeMatch = (id: string, homeTeamId: string, awayTeamId: string, refereeId?: string) =>
    prisma.match.create({
      data: {
        id,
        seasonId: season.id,
        divisionId: division.id,
        homeTeamId,
        awayTeamId,
        refereeId,
        kickoffAt: new Date("2026-09-22T01:30:00Z"),
        matchweek: "1",
      },
    });
  return { season, division, teams, makeMatch };
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("ICS serialization", () => {
  it("keeps a stable UID and advances sequence and revision timestamps after reschedule", () => {
    const before = serializeCalendar({ name: "MSSL", matches: [calendarMatch()] });
    const after = serializeCalendar({
      name: "MSSL",
      matches: [
        calendarMatch({
          kickoffAt: new Date("2026-09-29T01:30:00Z"),
          updatedAt: new Date("2026-09-10T15:45:00Z"),
          version: 3,
        }),
      ],
    });
    expect(before).toContain("UID:match-stable@mssl\r\n");
    expect(after).toContain("UID:match-stable@mssl\r\n");
    expect(before).toContain("SEQUENCE:2\r\n");
    expect(after).toContain("SEQUENCE:3\r\n");
    expect(after).toContain("LAST-MODIFIED:20260910T154500Z\r\n");
    expect(after).toContain("DTSTART:20260929T013000Z\r\n");
  });

  it("escapes text, emits status, uses CRLF, and folds UTF-8 lines to 75 octets", () => {
    const body = serializeCalendar({
      name: "Calendar, one; two",
      matches: [
        calendarMatch({
          status: "CANCELLED",
          venueName: `Café, East; Field\\A\n${"é".repeat(80)}`,
        }),
      ],
    });
    expect(body).toContain("X-WR-CALNAME:Calendar\\, one\\; two\r\n");
    expect(body).toContain("STATUS:CANCELLED\r\n");
    expect(body).toContain("LOCATION:Café\\, East\\; Field\\\\A\\n");
    expect(body).not.toMatch(/(^|[^\r])\n/);
    for (const line of body.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(foldIcalLine(`SUMMARY:${"é".repeat(40)}`)).toContain("\r\n ");
  });
});

describe("calendar routes", () => {
  it("returns 401 and private no-store for a signed-out personal feed", async () => {
    mockedAuth.mockResolvedValue(null);
    const response = await getPersonalCalendar(new Request("http://localhost/calendar.ics"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("filters a personal feed by active membership, captain team, and referee assignments", async () => {
    const { season, teams, makeMatch } = await fixture();
    const person = await prisma.appUser.create({
      data: {
        entraObjectId: "calendar-person",
        email: "person@example.com",
        normalizedEmail: "person@example.com",
        displayName: "Calendar Person",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "REFEREE" } },
      },
    });
    await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: teams[0].id, userId: person.id },
    });
    await prisma.teamCaptain.create({
      data: {
        seasonId: season.id,
        teamId: teams[1].id,
        userId: person.id,
        name: person.displayName,
        status: "ACTIVE",
      },
    });
    const referee = await prisma.referee.create({
      data: {
        userId: person.id,
        entraObjectId: person.entraObjectId,
        name: person.displayName,
        email: person.email,
      },
    });
    await makeMatch("member-match", teams[0].id, teams[2].id);
    await makeMatch("captain-match", teams[1].id, teams[2].id);
    await makeMatch("referee-match", teams[2].id, teams[3].id, referee.id);
    await makeMatch("unrelated-match", teams[2].id, teams[3].id);
    mockedAuth.mockResolvedValue({
      user: {
        id: person.entraObjectId,
        appUserId: person.id,
        name: person.displayName,
        email: person.email,
        image: null,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await getPersonalCalendar(
      new Request(`http://localhost/calendar.ics?season=${season.slug}`),
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toContain("UID:member-match@mssl");
    expect(body).toContain("UID:captain-match@mssl");
    expect(body).toContain("UID:referee-match@mssl");
    expect(body).not.toContain("UID:unrelated-match@mssl");

    const missingSeason = await getPersonalCalendar(
      new Request("http://localhost/calendar.ics?season=missing"),
    );
    expect(missingSeason.status).toBe(404);
    expect(missingSeason.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns a public, team-isolated feed and 404s unknown filters", async () => {
    const { season, teams, makeMatch } = await fixture();
    await makeMatch("alpha-match", teams[0].id, teams[1].id);
    await makeMatch("other-match", teams[2].id, teams[3].id);

    const response = await getTeamCalendar(
      new Request(`http://localhost/teams/alpha/calendar.ics?season=${season.slug}`),
      { params: Promise.resolve({ id: teams[0].slug }) },
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(body).toContain("UID:alpha-match@mssl");
    expect(body).not.toContain("UID:other-match@mssl");

    const missingTeam = await getTeamCalendar(
      new Request("http://localhost/teams/missing/calendar.ics"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missingTeam.status).toBe(404);
    const missingSeason = await getTeamCalendar(
      new Request("http://localhost/teams/alpha/calendar.ics?season=missing"),
      { params: Promise.resolve({ id: teams[0].slug }) },
    );
    expect(missingSeason.status).toBe(404);
  });

  it("returns one public fixture for an individual match download", async () => {
    const { teams, makeMatch } = await fixture();
    await makeMatch("single-match", teams[0].id, teams[1].id);
    await makeMatch("other-match", teams[2].id, teams[3].id);

    const response = await getMatchCalendar(
      new Request("http://localhost/matches/single-match/calendar.ics"),
      { params: Promise.resolve({ id: "single-match" }) },
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      'filename="mssl-match-single-match.ics"',
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(body).toContain("UID:single-match@mssl");
    expect(body).not.toContain("UID:other-match@mssl");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);

    const missing = await getMatchCalendar(
      new Request("http://localhost/matches/missing/calendar.ics"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missing.status).toBe(404);
  });
});
