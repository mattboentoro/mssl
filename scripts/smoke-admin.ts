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
import { getStandingsForSeason } from "../src/lib/queries";

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
  // Explicit values win: a scraped hidden default (e.g. the colour picker's
  // initial swatch) must not be appended alongside the value we are testing.
  for (const [key, value] of Object.entries(hidden)) {
    if (key in values) continue;
    body.append(key, value);
  }
  for (const [key, value] of Object.entries(values)) body.append(key, value);

  const res = await req(path, { method: "POST", body });
  return { status: res.status, html: await res.text() };
}

async function main(): Promise<void> {
  console.log(`MSSL Match Control smoke test against ${BASE}\n`);

  const division = await prisma.division.findFirstOrThrow({
    where: { season: { isActive: true } },
    include: { teams: { take: 2 } },
  });
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
    colorPrimary: "#6d28d9",
    colorAlternate: "#facc15",
    contactEmail: "",
  });
  const team = await prisma.team.findFirst({ where: { name: teamName } });
  check("createTeamAction writes a team", team !== null);
  check(
    "createTeamAction stores both kit colours",
    team?.colorPrimary === "#6d28d9" && team?.colorAlternate === "#facc15",
    `${team?.colorPrimary} / ${team?.colorAlternate}`,
  );

  if (team) {
    await submit("/admin/discipline", 'id="disc-player"', {
      seasonId: division.seasonId,
      teamId: team.id,
      playerName: `Smoke Tester ${stamp}`,
      type: "RED",
      minute: "",
      matchId: "",
      note: "Automated smoke sanction",
    });
    const card = await prisma.disciplinaryAction.findFirst({ where: { teamId: team.id } });
    check("createDisciplinaryAction writes a league sanction", card !== null);
    check("the sanction is stamped ADMIN", card?.issuedBy === "ADMIN", String(card?.issuedBy));

    console.log("\nTeam editing");
    const renamed = `${teamName} Renamed`;
    await submit("/admin/league", `id="team-${team.id}-name"`, {
      teamId: team.id,
      divisionId: team.divisionId,
      name: renamed,
      shortName: "SMR",
      slug: team.slug,
      colorPrimary: "#166534",
      colorAlternate: "#cbd5e1",
      captainName: "Smoke Captain",
      contactEmail: "smoke@example.com",
    });
    const edited = await prisma.team.findUnique({ where: { id: team.id } });
    check("updateTeamAction renames a team", edited?.name === renamed, String(edited?.name));
    check(
      "updateTeamAction recolours both kits",
      edited?.colorPrimary === "#166534" && edited?.colorAlternate === "#cbd5e1",
      `${edited?.colorPrimary} / ${edited?.colorAlternate}`,
    );
    check(
      "updateTeamAction saves captain and contact",
      edited?.captainName === "Smoke Captain" && edited?.contactEmail === "smoke@example.com",
    );
    check(
      "the team edit is audited",
      (await prisma.auditLog.count({
        where: { action: "team.update", entityId: team.id },
      })) === 1,
    );

    // A second team may not steal an existing slug.
    const rival = await prisma.team.findFirst({
      where: { divisionId: team.divisionId, id: { not: team.id } },
    });
    if (rival) {
      await submit("/admin/league", `id="team-${team.id}-name"`, {
        teamId: team.id,
        divisionId: team.divisionId,
        name: renamed,
        shortName: "SMR",
        slug: rival.slug,
        colorPrimary: "#166534",
        colorAlternate: "#cbd5e1",
        captainName: "",
        contactEmail: "",
      });
      const clashed = await prisma.team.findUnique({ where: { id: team.id } });
      check("updateTeamAction refuses a duplicate slug", clashed?.slug === team.slug);
    }

    // Restore the name so the delete-confirmation check below still matches.
    await prisma.team.update({ where: { id: team.id }, data: { name: teamName } });
  }

  console.log("\nPoints adjustments");
  {
    const target = division.teams[0];
    const reason = `Smoke sanction ${stamp}`;

    // A deduction must reduce the points the calculator reports, not just store a row.
    const beforeRow = (await getStandingsForSeason(division.seasonId))
      .flatMap((d) => d.rows)
      .find((r) => r.teamId === target.id);

    const applied = await submit("/admin/standings", 'id="adj-team"', {
      teamId: target.id,
      points: "-3",
      reason,
    });
    const stored = await prisma.pointsAdjustment.findFirst({ where: { reason } });
    check(
      "createPointsAdjustmentAction stores the deduction",
      stored?.points === -3,
      `status ${applied.status}`,
    );

    const afterRow = (await getStandingsForSeason(division.seasonId))
      .flatMap((d) => d.rows)
      .find((r) => r.teamId === target.id);
    check(
      "the deduction reaches the computed table",
      beforeRow !== undefined &&
        afterRow !== undefined &&
        afterRow.points === beforeRow.points - 3 &&
        afterRow.pointsAdjustment === beforeRow.pointsAdjustment - 3,
      `${beforeRow?.points} -> ${afterRow?.points}`,
    );
    check(
      "a deduction leaves results untouched",
      beforeRow !== undefined &&
        afterRow !== undefined &&
        afterRow.played === beforeRow.played &&
        afterRow.goalDifference === beforeRow.goalDifference,
    );

    // The public table has to explain itself, or a deduction looks like a bug.
    const publicTable = await (await req("/standings")).text();
    check(
      "the public table annotates the adjustment",
      publicTable.includes("point adjustment applied"),
    );

    const zero = await submit("/admin/standings", 'id="adj-team"', {
      teamId: target.id,
      points: "0",
      reason: `Zero ${stamp}`,
    });
    check(
      "a zero adjustment is rejected",
      (await prisma.pointsAdjustment.count({ where: { reason: `Zero ${stamp}` } })) === 0,
      `status ${zero.status}`,
    );

    if (stored) {
      await submit("/admin/standings", `value="${stored.id}"`, { adjustmentId: stored.id });
      const gone = await prisma.pointsAdjustment.findUnique({ where: { id: stored.id } });
      check("deletePointsAdjustmentAction reverses it", gone === null);

      const restored = (await getStandingsForSeason(division.seasonId))
        .flatMap((d) => d.rows)
        .find((r) => r.teamId === target.id);
      check(
        "reversing restores the earned points",
        restored !== undefined && beforeRow !== undefined && restored.points === beforeRow.points,
      );
    }
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

  console.log("\nKit selection");
  const importedMatch = await prisma.match.findFirst({ where: { matchweek: MW } });
  if (importedMatch) {
    // The schedule panel posts JSON to the API rather than running a server
    // action, so drive the route directly.
    const rekit = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        homeKit: "ALTERNATE",
        awayKit: "PRIMARY",
        reason: "Smoke kit swap",
      }),
    });
    const rekitted = await prisma.match.findUnique({ where: { id: importedMatch.id } });
    check(
      "admin can change which kit each side wears",
      rekitted?.homeKit === "ALTERNATE" && rekitted?.awayKit === "PRIMARY",
      `status ${rekit.status} \u2192 ${rekitted?.homeKit} / ${rekitted?.awayKit}`,
    );
    const kitAudit = await prisma.auditLog.findFirst({
      where: { entityId: importedMatch.id, action: "match.update" },
      orderBy: { createdAt: "desc" },
    });
    check("the kit change is audited", (kitAudit?.metadata ?? "").includes("ALTERNATE"));

    const bogus = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeKit: "TIE-DYE" }),
    });
    check("Zod rejects an unknown kit choice", bogus.status === 422, `status ${bogus.status}`);

    await signIn("referee");
    const denied = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeKit: "PRIMARY" }),
    });
    check("a referee cannot change kits", denied.status === 403, `status ${denied.status}`);
    await signIn("admin");
  }

  console.log("\nDestructive deletes");
  if (team) {
    await submit("/admin/league", `Type ${team.name} to confirm deletion`, {
      confirmName: "Wrong Name FC",
    });
    check(
      "deleting a team refuses a mistyped name",
      (await prisma.team.count({ where: { id: team.id } })) === 1,
    );

    await submit("/admin/league", `Type ${team.name} to confirm deletion`, {
      confirmName: team.name,
    });
    check(
      "deleteTeamAction removes the team",
      (await prisma.team.count({ where: { id: team.id } })) === 0,
    );
    check(
      "deleting a team cascades its discipline",
      (await prisma.disciplinaryAction.count({ where: { teamId: team.id } })) === 0,
    );
  }

  const doomedSeason = await prisma.season.create({
    data: {
      name: `Smoke Season ${stamp}`,
      slug: `smoke-season-${stamp}`,
      startsOn: new Date("2031-01-01"),
      endsOn: new Date("2031-12-31"),
      isActive: false,
    },
  });
  await submit("/admin/league", `Type ${doomedSeason.name} to confirm deletion`, {
    confirmName: doomedSeason.name,
  });
  check(
    "deleteSeasonAction removes an inactive season",
    (await prisma.season.count({ where: { id: doomedSeason.id } })) === 0,
  );

  const activeSeason = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const activeLeague = await (await req("/admin/league")).text();
  check(
    "the active season offers no delete control",
    !activeLeague.includes(`Type ${activeSeason.name} to confirm deletion`),
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
  if (team) await prisma.disciplinaryAction.deleteMany({ where: { teamId: team.id } });
  if (team) await prisma.team.deleteMany({ where: { id: team.id } });
  await prisma.season.deleteMany({ where: { id: doomedSeason.id } });
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
