/**
 * End-to-end smoke test of Match Control (admin server actions) against a
 * running dev server.
 *
 *   npm run dev            # in one terminal
 *   npm run smoke:admin    # in another
 *
 * Server actions are exercised over the *progressive-enhancement* path: the
 * page is fetched, the hidden `$ACTION_*` fields React renders for no-JS
 * submission are lifted out of the target form, and the form is POSTed back.
 * That runs the real action through the real authorization and Zod layers.
 *
 * Requires DEV_AUTH_BYPASS=true and seeded data. It mutates the dev database
 * and cleans up after itself.
 */
import { prisma } from "../src/lib/prisma";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const jar = new Map<string, string>();
let failures = 0;

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorb(res: Response): void {
  for (const cookie of res.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" || value === "deleted") jar.delete(name);
    else jar.set(name, value);
  }
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  absorb(res);
  return res;
}

function check(label: string, passed: boolean, detail = ""): void {
  if (!passed) failures += 1;
  console.log(`  ${passed ? "\u2713" : "\u2717"} ${label}${detail ? ` \u2014 ${detail}` : ""}`);
}

async function signIn(persona: string): Promise<void> {
  jar.clear();
  const { csrfToken } = (await (await req("/api/auth/csrf")).json()) as { csrfToken: string };
  await req("/api/auth/callback/dev-bypass", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ persona, csrfToken, callbackUrl: `${BASE}/admin`, json: "true" }),
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Lift the hidden server-action fields out of the form containing `marker`. */
function actionFields(html: string, marker: string): Record<string, string> | null {
  for (const chunk of html.split(/<form/).slice(1)) {
    const block = chunk.split("</form>")[0];
    if (!block.includes(marker)) continue;
    const fields: Record<string, string> = {};
    for (const match of block.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = /name="([^"]+)"/.exec(match[0])?.[1];
      if (!name) continue;
      fields[name] = decodeEntities(/value="([^"]*)"/.exec(match[0])?.[1] ?? "");
    }
    return fields;
  }
  return null;
}

/** Submit the form identified by `marker` on `path` with the given values. */
async function submit(
  path: string,
  marker: string,
  values: Record<string, string>,
): Promise<{ status: number; html: string }> {
  const html = await (await req(path)).text();
  const hidden = actionFields(html, marker);
  if (!hidden) return { status: 0, html: `form containing ${marker} not found` };

  const body = new FormData();
  for (const [key, value] of Object.entries(hidden)) body.append(key, value);
  for (const [key, value] of Object.entries(values)) body.append(key, value);

  const res = await req(path, { method: "POST", body });
  return { status: res.status, html: await res.text() };
}

async function main(): Promise<void> {
  console.log(`MSSL Match Control smoke test against ${BASE}\n`);

  const division = await prisma.division.findFirstOrThrow({ include: { teams: { take: 2 } } });
  const stamp = Date.now();

  // csvMatchRowSchema caps matchweek at 60, so import into the first unused slot.
  const busiest = await prisma.match.aggregate({ _max: { matchweek: true } });
  const MW = Math.min(60, (busiest._max.matchweek ?? 0) + 1);
  await prisma.match.deleteMany({ where: { matchweek: MW } });

  console.log("Access control");
  await signIn("referee");
  const refAdmin = await req("/admin/league");
  check("referee gets 403 on Match Control", refAdmin.status === 403, `status ${refAdmin.status}`);
  const refVenue = `Denied Pitch ${stamp}`;
  await submit("/admin/league", 'id="venue-name"', { name: refVenue, city: "Nope" });
  const leaked = await prisma.venue.findFirst({ where: { name: refVenue } });
  check("referee cannot run createVenueAction", leaked === null);

  console.log("\nLeague setup CRUD");
  await signIn("admin");

  const venueName = `Smoke Pitch ${stamp}`;
  const venueRes = await submit("/admin/league", 'id="venue-name"', {
    name: venueName,
    city: "Redmond",
    address: "1 Smoke Way",
    mapUrl: "",
  });
  const venue = await prisma.venue.findFirst({ where: { name: venueName } });
  check("createVenueAction writes a venue", venue !== null, `status ${venueRes.status}`);

  await submit("/admin/league", 'id="venue-name"', { name: "", city: "" });
  const blanks = await prisma.venue.count({ where: { name: "" } });
  check("Zod rejects a blank venue name", blanks === 0);

  const teamName = `Smoke FC ${stamp}`;
  await submit("/admin/league", 'id="team-name"', {
    divisionId: division.id,
    name: teamName,
    shortName: "SMK",
    crestEmoji: "\u26BD",
    contactEmail: "",
  });
  const team = await prisma.team.findFirst({ where: { name: teamName } });
  check("createTeamAction writes a team", team !== null);

  if (team) {
    await submit("/admin/league", 'id="player-first"', {
      teamId: team.id,
      firstName: "Smoke",
      lastName: `Tester ${stamp}`,
      jerseyNumber: "7",
      position: "Forward",
      email: "",
    });
    const player = await prisma.player.findFirst({ where: { teamId: team.id } });
    check("createPlayerAction writes a player", player !== null);
  }

  console.log("\nContent");
  const headline = `Smoke news ${stamp}`;
  await submit("/admin/content", 'id="ann-title"', {
    title: headline,
    summary: "Smoke summary",
    body: "Smoke body",
    seasonId: "",
  });
  const announcement = await prisma.announcement.findFirst({ where: { title: headline } });
  check("createAnnouncementAction publishes", announcement !== null);

  console.log("\nCSV schedule import");
  const goodRow = `${MW},2030-06-01T18:00:00Z,${division.name},${division.teams[0].name},${division.teams[1].name}`;
  const badRow = `${MW},2030-06-01T20:00:00Z,${division.name},Nobody FC,${division.teams[1].name}`;
  const header = "matchweek,kickoff,division,home,away";

  const dry = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}\n${badRow}`,
    seasonId: division.seasonId,
    mode: "dry-run",
  });
  const untouched = await prisma.match.count({ where: { matchweek: MW } });
  check("dry run writes nothing", untouched === 0, `status ${dry.status}`);
  check("dry run reports the unknown team", dry.html.includes("Nobody FC"));

  const refused = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}\n${badRow}`,
    seasonId: division.seasonId,
    mode: "commit",
  });
  const stillUntouched = await prisma.match.count({ where: { matchweek: MW } });
  check(
    "commit refuses the whole batch while any row errors",
    stillUntouched === 0 && refused.html.includes("Fix every row error"),
  );

  await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}`,
    seasonId: division.seasonId,
    mode: "commit",
  });
  const imported = await prisma.match.count({ where: { matchweek: MW } });
  check("a clean batch imports", imported === 1, `${imported} fixture(s)`);

  const dupe = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}`,
    seasonId: division.seasonId,
    mode: "commit",
  });
  const afterDupe = await prisma.match.count({ where: { matchweek: MW } });
  check(
    "re-importing the same row is skipped as a duplicate",
    afterDupe === 1 && dupe.html.includes("Nothing new to import"),
  );

  console.log("\nAudit trail");
  const audited = await prisma.auditLog.count({
    where: {
      action: { in: ["venue.create", "team.create", "announcement.create", "schedule.import"] },
      createdAt: { gte: new Date(stamp) },
    },
  });
  check("every admin write is audited", audited >= 4, `${audited} rows`);
  const auditPage = await req("/admin/audit?action=schedule.import");
  check(
    "audit viewer filters by action",
    auditPage.status === 200 && (await auditPage.text()).includes("schedule.import"),
  );

  // ---- clean up -----------------------------------------------------------
  await prisma.match.deleteMany({ where: { matchweek: MW } });
  if (team) await prisma.player.deleteMany({ where: { teamId: team.id } });
  if (team) await prisma.team.delete({ where: { id: team.id } });
  if (venue) await prisma.venue.delete({ where: { id: venue.id } });
  if (announcement) await prisma.announcement.delete({ where: { id: announcement.id } });

  console.log(
    failures === 0 ? "\nAll Match Control checks passed." : `\n${failures} check(s) FAILED.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
