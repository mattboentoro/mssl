import { PrismaClient } from "@prisma/client";

import { kitsClash } from "../src/lib/kits";

/**
 * Deterministic seed data.
 *
 * Goal: `npm run seed && npm run dev` gives a fully browsable league with
 * finished matchweeks (so the standings table has content), a matchweek that is
 * mid-flight (claimed / report submitted) and future unclaimed fixtures that a
 * referee can claim to exercise the claim -> report flow end to end.
 */

const prisma = new PrismaClient();

/** Tiny deterministic PRNG (mulberry32) so re-seeding gives identical data. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260909);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const chance = (p: number): boolean => random() < p;
const intBetween = (min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

const DAY = 24 * 60 * 60 * 1000;

function atTime(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const FIRST_NAMES = [
  "Alex",
  "Sam",
  "Jordan",
  "Riley",
  "Casey",
  "Morgan",
  "Taylor",
  "Jamie",
  "Avery",
  "Quinn",
  "Rowan",
  "Devin",
  "Elliot",
  "Harper",
  "Kai",
  "Logan",
  "Micah",
  "Noel",
  "Parker",
  "Reese",
  "Sasha",
  "Tariq",
  "Yusuf",
  "Zara",
  "Nina",
  "Priya",
  "Omar",
  "Lena",
  "Diego",
  "Mateo",
];
const LAST_NAMES = [
  "Alvarez",
  "Bakshi",
  "Chen",
  "Dahl",
  "Eriksen",
  "Fontaine",
  "Garcia",
  "Hoffman",
  "Ibrahim",
  "Jensen",
  "Kowalski",
  "Lindqvist",
  "Mbeki",
  "Nakamura",
  "Oyelaran",
  "Petrov",
  "Quintana",
  "Rossi",
  "Silva",
  "Tanaka",
  "Ustinov",
  "Vargas",
  "Weber",
  "Xiao",
  "Yilmaz",
  "Zhang",
];

interface TeamSpec {
  name: string;
  shortName: string;
  slug: string;
  colorPrimary: string;
  colorAlternate: string;
}

const PREMIER_LEAGUE_TEAMS: TeamSpec[] = [
  {
    name: "False 9-5",
    shortName: "F95",
    slug: "false-9-5",
    colorPrimary: "#111111",
    colorAlternate: "#ffffff",
  },
  {
    name: "Seaturks",
    shortName: "SEA",
    slug: "seaturks",
    colorPrimary: "#0f766e",
    colorAlternate: "#ffffff",
  },
  {
    name: "SMURF",
    shortName: "SMU",
    slug: "smurf",
    colorPrimary: "#1d4ed8",
    colorAlternate: "#ffffff",
  },
  {
    name: "FFC",
    shortName: "FFC",
    slug: "ffc",
    colorPrimary: "#c8102e",
    colorAlternate: "#ffffff",
  },
  {
    name: "SOS",
    shortName: "SOS",
    slug: "sos",
    colorPrimary: "#ea580c",
    colorAlternate: "#111111",
  },
  {
    name: "Chargers",
    shortName: "CHG",
    slug: "chargers",
    colorPrimary: "#facc15",
    colorAlternate: "#1e293b",
  },
  {
    name: "RCS United",
    shortName: "RCS",
    slug: "rcs-united",
    colorPrimary: "#166534",
    colorAlternate: "#ffffff",
  },
  {
    name: "Tequileros",
    shortName: "TEQ",
    slug: "tequileros",
    colorPrimary: "#65a30d",
    colorAlternate: "#111111",
  },
];

const FIRST_DIVISION_TEAMS: TeamSpec[] = [
  {
    name: "The POT",
    shortName: "POT",
    slug: "the-pot",
    colorPrimary: "#6d28d9",
    colorAlternate: "#ffffff",
  },
  {
    name: "Free Foulin",
    shortName: "FRF",
    slug: "free-foulin",
    colorPrimary: "#c8102e",
    colorAlternate: "#ffffff",
  },
  {
    name: "Dejong United",
    shortName: "DJU",
    slug: "dejong-united",
    colorPrimary: "#ea580c",
    colorAlternate: "#111111",
  },
  {
    name: "Arsenal",
    shortName: "ARS",
    slug: "arsenal",
    colorPrimary: "#c8102e",
    colorAlternate: "#1e293b",
  },
  {
    name: "Tap-in Merchants FC",
    shortName: "TIM",
    slug: "tap-in-merchants-fc",
    colorPrimary: "#0ea5e9",
    colorAlternate: "#1e293b",
  },
  {
    name: "Red Star",
    shortName: "RDS",
    slug: "red-star",
    colorPrimary: "#7f1d1d",
    colorAlternate: "#ffffff",
  },
  {
    name: "Atlettcopilot",
    shortName: "ATC",
    slug: "atlettcopilot",
    colorPrimary: "#ffffff",
    colorAlternate: "#c8102e",
  },
];

const VENUES = [
  {
    name: "Microsoft Soccer Field 1",
    slug: "ms-field-1",
    address: "15255 NE 40th St",
    city: "Redmond, WA",
    notes: "Full-size turf, lights until 22:00. Parking in the East garage.",
    mapUrl: "https://www.bing.com/maps?q=Microsoft+Redmond+Campus",
  },
  {
    name: "Microsoft Soccer Field 2",
    slug: "ms-field-2",
    address: "15255 NE 40th St",
    city: "Redmond, WA",
    notes: "Shares lights with Field 1. No spectator seating.",
    mapUrl: "https://www.bing.com/maps?q=Microsoft+Redmond+Campus",
  },
  {
    name: "Marymoor Turf A",
    slug: "marymoor-turf-a",
    address: "6046 W Lake Sammamish Pkwy NE",
    city: "Redmond, WA",
    notes: "County park — arrive 20 minutes early, gate closes at 21:30.",
    mapUrl: "https://www.bing.com/maps?q=Marymoor+Park",
  },
  {
    name: "Bellevue Indoor Arena",
    slug: "bellevue-indoor-arena",
    address: "14200 SE Eastgate Way",
    city: "Bellevue, WA",
    notes: "Used for winter and rain-out reschedules.",
    mapUrl: "https://www.bing.com/maps?q=Bellevue+WA",
  },
];

/**
 * Referees. The first three e-mails line up with the dev-bypass personas in
 * `src/auth.ts`, so signing in as "dev referee" lands on a real referee record.
 */
const REFEREES = [
  {
    name: "Riley Whistle",
    email: "riley.whistle@example.com",
    certification: "USSF Grade 7",
    phone: "425-555-0101",
  },
  {
    name: "Sam Sideline",
    email: "sam.sideline@example.com",
    certification: "USSF Grade 8",
    phone: "425-555-0102",
  },
  {
    name: "Alex Board",
    email: "alex.board@example.com",
    certification: "League administrator",
    phone: "425-555-0100",
  },
  {
    name: "Dana Offside",
    email: "dana.offside@example.com",
    certification: "USSF Grade 8",
    phone: "425-555-0103",
  },
  {
    name: "Chris Cardoso",
    email: "chris.cardoso@example.com",
    certification: "USSF Grade 7",
    phone: "425-555-0104",
  },
];

/**
 * Circle-method single round robin. Returns rounds of [home, away] index pairs.
 * An odd team count gets a phantom opponent, so whoever draws it has a bye that
 * matchweek and simply plays no fixture.
 */
function roundRobin(count: number): [number, number][][] {
  const bye = count % 2 === 1 ? count : -1;
  const ids = [...Array(count).keys()];
  if (bye >= 0) ids.push(bye);
  const size = ids.length;

  const rounds: [number, number][][] = [];
  for (let round = 0; round < size - 1; round += 1) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < size / 2; i += 1) {
      const home = ids[i];
      const away = ids[size - 1 - i];
      if (home === bye || away === bye) continue;
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop() as number);
  }
  return rounds;
}

async function reset() {
  // Order matters: children first (SQLite foreign keys are enforced by Prisma).
  await prisma.auditLog.deleteMany();
  await prisma.disciplinaryAction.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.season.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.document.deleteMany();
}

/**
 * Squads are not stored in the database — referees type player names as free
 * text on the game report. The seed keeps a deterministic pool of plausible
 * names per team so the sample disciplinary records look realistic.
 */
type SeededTeam = {
  id: string;
  name: string;
  squad: string[];
  colorPrimary: string;
  colorAlternate: string;
};

function makeSquad(seedText: string): string[] {
  const base = [...seedText].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return Array.from({ length: 11 }, (_, i) => {
    const first = FIRST_NAMES[(base + i * 7) % FIRST_NAMES.length];
    const last = LAST_NAMES[(base + i * 5) % LAST_NAMES.length];
    return `${first} ${last}`;
  });
}

async function seedSeason(options: {
  name: string;
  slug: string;
  isActive: boolean;
  /** Kickoff of matchweek 1, relative to now in days. */
  firstMatchweekOffsetDays: number;
  venueIds: string[];
  refereeIds: string[];
}) {
  const { name, slug, isActive, firstMatchweekOffsetDays, venueIds, refereeIds } = options;
  const now = Date.now();
  const firstKickoff = new Date(now + firstMatchweekOffsetDays * DAY);

  const season = await prisma.season.create({
    data: {
      name,
      slug,
      isActive,
      startsOn: new Date(firstKickoff.getTime() - 7 * DAY),
      endsOn: new Date(firstKickoff.getTime() + 42 * DAY),
    },
  });

  const divisionSpecs = [
    { name: "Premier League", slug: "premier-league", sortOrder: 1, teams: PREMIER_LEAGUE_TEAMS },
    { name: "First Division", slug: "first-division", sortOrder: 2, teams: FIRST_DIVISION_TEAMS },
  ];

  for (const spec of divisionSpecs) {
    const division = await prisma.division.create({
      data: {
        seasonId: season.id,
        name: spec.name,
        slug: spec.slug,
        sortOrder: spec.sortOrder,
      },
    });

    const teams: SeededTeam[] = [];
    for (const teamSpec of spec.teams) {
      const team = await prisma.team.create({
        data: {
          divisionId: division.id,
          name: teamSpec.name,
          slug: teamSpec.slug,
          shortName: teamSpec.shortName,
          colorPrimary: teamSpec.colorPrimary,
          colorAlternate: teamSpec.colorAlternate,
          captainName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          contactEmail: `${teamSpec.slug}@example.com`,
        },
      });

      teams.push({
        id: team.id,
        name: team.name,
        squad: makeSquad(teamSpec.slug),
        colorPrimary: team.colorPrimary,
        colorAlternate: team.colorAlternate,
      });
    }

    const rounds = roundRobin(teams.length);

    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
      const matchweek = roundIndex + 1;
      const matchDay = new Date(firstKickoff.getTime() + roundIndex * 7 * DAY);
      const slots = [
        [18, 0],
        [19, 15],
        [20, 30],
      ];

      let slotIndex = 0;
      for (const [homeIdx, awayIdx] of rounds[roundIndex]) {
        const home = teams[homeIdx];
        const away = teams[awayIdx];
        const [hour, minute] = slots[slotIndex % slots.length];
        slotIndex += 1;

        const kickoffAt = atTime(matchDay, hour, minute);
        const inPast = kickoffAt.getTime() < now;
        const daysUntil = (kickoffAt.getTime() - now) / DAY;

        // Lifecycle stage for this fixture.
        let stage: "played" | "submitted" | "assigned" | "open" | "postponed";
        if (!isActive) {
          stage = "played";
        } else if (inPast && daysUntil < -3) {
          stage = "played";
        } else if (inPast) {
          stage = slotIndex % 3 === 0 ? "submitted" : "played";
        } else if (daysUntil < 4) {
          stage = slotIndex % 3 === 2 ? "open" : "assigned";
        } else {
          stage = slotIndex % 7 === 0 ? "postponed" : "open";
        }

        const refereeId =
          stage === "open" || stage === "postponed"
            ? null
            : refereeIds[(roundIndex + slotIndex) % refereeIds.length];

        const status =
          stage === "played"
            ? "CONFIRMED"
            : stage === "submitted"
              ? "REPORT_SUBMITTED"
              : stage === "assigned"
                ? "ASSIGNED"
                : stage === "postponed"
                  ? "POSTPONED"
                  : "SCHEDULED";

        // Home wears its first-choice kit and the away side switches when the
        // two primaries are too close to tell apart. If the away alternate is
        // no better (several sides carry a white change strip), the home team
        // changes instead and the away side keeps its primary.
        let homeKit: "PRIMARY" | "ALTERNATE" = "PRIMARY";
        let awayKit: "PRIMARY" | "ALTERNATE" = "PRIMARY";
        if (kitsClash(home.colorPrimary, away.colorPrimary)) {
          if (!kitsClash(home.colorPrimary, away.colorAlternate)) {
            awayKit = "ALTERNATE";
          } else if (!kitsClash(home.colorAlternate, away.colorPrimary)) {
            homeKit = "ALTERNATE";
          } else {
            awayKit = "ALTERNATE";
          }
        }

        const match = await prisma.match.create({
          data: {
            seasonId: season.id,
            divisionId: division.id,
            homeTeamId: home.id,
            awayTeamId: away.id,
            venueId: venueIds[(roundIndex + slotIndex) % venueIds.length],
            kickoffAt,
            matchweek,
            status,
            homeKit,
            awayKit,
            refereeId,
            assignedAt: refereeId ? new Date(kickoffAt.getTime() - 3 * DAY) : null,
            version: stage === "open" ? 0 : stage === "assigned" ? 1 : 2,
            notes: stage === "postponed" ? "Postponed \u2014 field closed for maintenance." : null,
          },
        });

        if (stage === "played" || stage === "submitted") {
          await createReport({
            matchId: match.id,
            seasonId: season.id,
            refereeId: refereeId as string,
            home,
            away,
            confirmed: stage === "played",
            kickoffAt,
          });
        }
      }
    }
  }

  return season;
}

async function createReport(args: {
  matchId: string;
  seasonId: string;
  refereeId: string;
  home: SeededTeam;
  away: SeededTeam;
  confirmed: boolean;
  kickoffAt: Date;
}) {
  const { matchId, seasonId, refereeId, home, away, confirmed, kickoffAt } = args;

  // Roughly realistic low-scoring soccer results.
  const forfeit = chance(0.04);
  let homeScore = 0;
  let awayScore = 0;
  let homeForfeit = false;
  let awayForfeit = false;

  if (forfeit) {
    if (chance(0.5)) {
      homeForfeit = true;
      homeScore = 0;
      awayScore = 3;
    } else {
      awayForfeit = true;
      homeScore = 3;
      awayScore = 0;
    }
  } else {
    homeScore = intBetween(0, 4);
    awayScore = intBetween(0, 3);
  }

  const cards: {
    seasonId: string;
    matchId: string;
    teamId: string;
    playerName: string;
    type: string;
    minute: number;
    note: string | null;
    issuedBy: string;
  }[] = [];

  if (!homeForfeit && !awayForfeit) {
    for (const team of [home, away]) {
      const yellows = chance(0.55) ? intBetween(1, 2) : 0;
      for (let i = 0; i < yellows; i += 1) {
        cards.push({
          seasonId,
          matchId,
          teamId: team.id,
          playerName: pick(team.squad),
          type: "YELLOW",
          minute: intBetween(10, 90),
          note: pick([
            "Dissent",
            "Reckless challenge",
            "Delaying the restart",
            "Persistent infringement",
          ]),
          issuedBy: "REFEREE",
        });
      }
      if (chance(0.08)) {
        cards.push({
          seasonId,
          matchId,
          teamId: team.id,
          playerName: pick(team.squad),
          type: "RED",
          minute: intBetween(40, 90),
          note: "Serious foul play",
          issuedBy: "REFEREE",
        });
      }
    }
  }

  cards.sort((a, b) => a.minute - b.minute);

  await prisma.gameReport.create({
    data: {
      matchId,
      refereeId,
      homeScore,
      awayScore,
      homeForfeit,
      awayForfeit,
      status: confirmed ? "CONFIRMED" : "SUBMITTED",
      submittedAt: new Date(kickoffAt.getTime() + 2 * 60 * 60 * 1000),
      confirmedAt: confirmed ? new Date(kickoffAt.getTime() + 26 * 60 * 60 * 1000) : null,
      notes: pick([
        "Match completed without incident.",
        "Good spirit throughout, both captains cooperative.",
        "Heavy rain in the second half, pitch held up fine.",
        "Late start (10 minutes) waiting for the away side.",
      ]),
      incidentReport: chance(0.1)
        ? "Spectator asked to move behind the barrier in the 70th minute. Complied immediately."
        : null,
      misconduct: cards.some((c) => c.type === "RED")
        ? "Send-off reported to the disciplinary committee."
        : null,
      discipline: { create: cards },
    },
  });
}

/**
 * League sanctions issued by the Game Administrator outside any fixture. These
 * are what the referee taking a game sees on their warning board, so they are
 * aimed deliberately at teams playing in the still-unclaimed fixtures.
 */
async function seedLeagueSanctions(seasonId: string) {
  const openMatches = await prisma.match.findMany({
    where: { seasonId, refereeId: null, status: "SCHEDULED" },
    orderBy: { kickoffAt: "asc" },
    take: 3,
    select: { id: true, homeTeamId: true, awayTeamId: true },
  });

  const notes = [
    "Two-match suspension after accumulating five yellows. Not eligible until matchweek 8.",
    "Dissent towards the officials reported by the previous referee. Monitor closely.",
    "Final warning from the disciplinary committee following a send-off.",
  ];

  let issued = 0;
  for (const match of openMatches) {
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      // Escalate a card the referee already showed, so the sanction reads as a
      // follow-up rather than appearing from nowhere.
      const priorCard = await prisma.disciplinaryAction.findFirst({
        where: { seasonId, teamId, issuedBy: "REFEREE" },
        orderBy: { createdAt: "desc" },
      });
      if (!priorCard) continue;

      await prisma.disciplinaryAction.create({
        data: {
          seasonId,
          teamId,
          playerName: priorCard.playerName,
          type: issued % 2 === 0 ? "RED" : "YELLOW",
          note: notes[issued % notes.length],
          issuedBy: "ADMIN",
        },
      });
      issued += 1;
    }
  }
  return issued;
}

async function seedContent(seasonId: string) {
  const announcements = [
    {
      title: "Fall season kicks off",
      slug: "fall-season-kicks-off",
      summary:
        "Matchweek 1 is live across both divisions. Check the schedule for your kickoff time.",
      body: "The new MSSL season is underway. Fixtures run on Tuesday and Thursday evenings across the Redmond and Marymoor fields.\n\nCaptains: bring your line-up to the pitch. Referees record cards against player names, so make sure your side introduces itself to the official before kickoff.",
      pinned: true,
    },
    {
      title: "Referees needed \u2014 sign up through Referee Control",
      slug: "referees-needed",
      summary: "Members of the msslrefs distribution list can now self-assign to fixtures online.",
      body: "Referee Control replaces the old sign-up spreadsheet. Sign in with your Microsoft account, open Referee Control, pick an open fixture and claim it.\n\nClaiming a fixture assigns it to you exclusively \u2014 nobody else can take it. After the final whistle, file the game report from the same screen: final score, any cards, and your notes. Standings update automatically from your report.",
      pinned: true,
    },
    {
      title: "Updated code of conduct",
      slug: "updated-code-of-conduct",
      summary: "The disciplinary points table has been revised for this season.",
      body: "Yellow cards now carry one disciplinary point and red cards three. Disciplinary points are the final league tiebreaker, after head-to-head record.",
      pinned: false,
    },
    {
      title: "Field 2 lights maintenance",
      slug: "field-2-lights-maintenance",
      summary: "Evening fixtures on Field 2 may be moved to Marymoor during the works.",
      body: "Facilities will be replacing the lighting controllers. Affected fixtures will be rescheduled and captains notified by e-mail.",
      pinned: false,
    },
  ];

  for (const [index, announcement] of announcements.entries()) {
    await prisma.announcement.create({
      data: {
        ...announcement,
        seasonId,
        publishedAt: new Date(Date.now() - (index + 1) * 3 * DAY),
        authorName: "MSSL Board",
      },
    });
  }

  const documents = [
    {
      title: "MSSL League Rules",
      category: "RULES",
      url: "/rules",
      description: "Full competition rules, laws of the game variations and match-day procedures.",
      fileType: "Page",
      sortOrder: 1,
    },
    {
      title: "Code of Conduct",
      category: "POLICY",
      url: "/rules#code-of-conduct",
      description: "Expected behaviour for players, captains, referees and spectators.",
      fileType: "Page",
      sortOrder: 2,
    },
    {
      title: "Player Registration Form",
      category: "FORMS",
      url: "/contact",
      description: "Register a new player with the league office (captain approval required).",
      fileType: "Form",
      sortOrder: 3,
    },
    {
      title: "Incident Report Guidance",
      category: "FORMS",
      url: "/rules#incidents",
      description: "What referees must include when reporting misconduct or injury.",
      fileType: "Page",
      sortOrder: 4,
    },
    {
      title: "Field Locations & Parking",
      category: "OTHER",
      url: "/contact#venues",
      description: "Directions and parking notes for every MSSL venue.",
      fileType: "Page",
      sortOrder: 5,
    },
    {
      title: "Disciplinary Points Table",
      category: "POLICY",
      url: "/rules#discipline",
      description: "Suspension thresholds and appeal process.",
      fileType: "Page",
      sortOrder: 6,
    },
  ];

  for (const doc of documents) {
    await prisma.document.create({ data: doc });
  }
}

async function main() {
  console.log("Resetting database...");
  await reset();

  console.log("Creating venues and referees...");
  const venues = [];
  for (const venue of VENUES) {
    venues.push(await prisma.venue.create({ data: venue }));
  }

  const referees = [];
  for (const referee of REFEREES) {
    referees.push(await prisma.referee.create({ data: referee }));
  }

  const venueIds = venues.map((v) => v.id);
  const refereeIds = referees.map((r) => r.id);

  console.log("Seeding previous season...");
  await seedSeason({
    name: "2026 Spring",
    slug: "2026-spring",
    isActive: false,
    firstMatchweekOffsetDays: -170,
    venueIds,
    refereeIds,
  });

  console.log("Seeding active season...");
  const active = await seedSeason({
    name: "2026 Fall",
    slug: "2026-fall",
    isActive: true,
    firstMatchweekOffsetDays: -21,
    venueIds,
    refereeIds,
  });

  console.log("Seeding announcements and documents...");
  await seedContent(active.id);

  console.log("Seeding league sanctions for the referee warning board...");
  await seedLeagueSanctions(active.id);

  const counts = {
    seasons: await prisma.season.count(),
    divisions: await prisma.division.count(),
    teams: await prisma.team.count(),
    venues: await prisma.venue.count(),
    referees: await prisma.referee.count(),
    matches: await prisma.match.count(),
    openMatches: await prisma.match.count({ where: { refereeId: null, status: "SCHEDULED" } }),
    reports: await prisma.gameReport.count(),
    cards: await prisma.disciplinaryAction.count(),
    sanctions: await prisma.disciplinaryAction.count({ where: { issuedBy: "ADMIN" } }),
  };

  console.log("\nSeed complete:");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key.padEnd(12)} ${value}`);
  }
  console.log(
    "\nSign in with DEV_AUTH_BYPASS=true as 'Referee' to claim one of the " +
      `${counts.openMatches} open fixtures.\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
