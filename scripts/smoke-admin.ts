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
import { kitsClash, resolveKit } from "../src/lib/kits";
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

  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const division = await prisma.division.findFirstOrThrow({
    orderBy: { sortOrder: "asc" },
    include: { teams: { take: 4 } },
  });
  const stamp = Date.now();

  // csvMatchRowSchema caps matchweek at 60, and the import checks claim two
  // consecutive slots, so leave room for both.
  const busiest = await prisma.match.aggregate({ _max: { matchweek: true } });
  const MW = Math.min(59, (busiest._max.matchweek ?? 0) + 1);
  await prisma.match.deleteMany({ where: { matchweek: { in: [MW, MW + 1] } } });

  console.log("Access control");
  await signIn("referee");
  const refAdmin = await req("/admin/league");
  check("referee gets 403 on Match Control", refAdmin.status === 403, `status ${refAdmin.status}`);
  const deniedTeam = `Denied FC ${stamp}`;
  await submit("/admin/league", 'id="team-name"', {
    divisionId: division.id,
    name: deniedTeam,
    shortName: "DEN",
  });
  const leaked = await prisma.team.findFirst({ where: { name: deniedTeam } });
  check("referee cannot run createTeamAction", leaked === null);

  console.log("\nLeague setup CRUD");
  await signIn("admin");

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
      seasonId: season.id,
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

    // ...but the same slug in a *different* division is not a clash. The
    // database only requires (divisionId, slug) to be unique, so a global check
    // locked teams out of their own editor.
    const seasonTeams = await prisma.team.findMany({
      select: { id: true, name: true, slug: true, divisionId: true },
    });
    let twinned: (typeof seasonTeams)[number] | undefined;
    let elsewhere = 0;
    for (const candidate of seasonTeams) {
      const count = await prisma.team.count({
        where: { slug: candidate.slug, divisionId: { not: candidate.divisionId } },
      });
      if (count > 0) {
        twinned = candidate;
        elsewhere = count;
        break;
      }
    }
    if (twinned) {
      const nudged = `${twinned.name} ${stamp}`;
      await submit("/admin/league", `id="team-${twinned.id}-name"`, {
        teamId: twinned.id,
        divisionId: twinned.divisionId,
        name: nudged,
        shortName: "TWN",
        slug: twinned.slug,
        colorPrimary: "#0f766e",
        colorAlternate: "#ffffff",
        captainName: "",
        contactEmail: "",
      });
      const saved = await prisma.team.findUnique({ where: { id: twinned.id } });
      check(
        "a team keeps its slug when another division uses the same one",
        saved?.name === nudged,
        `“${twinned.slug}” also used in ${elsewhere} other division(s)`,
      );
      await prisma.team.update({ where: { id: twinned.id }, data: { name: twinned.name } });
    }

    // Restore the name so the delete-confirmation check below still matches.
    await prisma.team.update({ where: { id: team.id }, data: { name: teamName } });
  }

  console.log("\nPoints adjustments");
  {
    const target = division.teams[0];
    const reason = `Smoke sanction ${stamp}`;

    // A deduction must reduce the points the calculator reports, not just store a row.
    const beforeRow = (await getStandingsForSeason(season.id))
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

    const afterRow = (await getStandingsForSeason(season.id))
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

      const restored = (await getStandingsForSeason(season.id))
        .flatMap((d) => d.rows)
        .find((r) => r.teamId === target.id);
      check(
        "reversing restores the earned points",
        restored !== undefined && beforeRow !== undefined && restored.points === beforeRow.points,
      );
    }
  }

  console.log("\nContent");
  const adjHtml = await (await req("/admin/standings")).text();
  check("the deduction console can be filtered by league", adjHtml.includes('id="adj-division"'));
  // The filter now runs in the browser, so every team ships with the page and
  // the check is that the picker has the data it needs to narrow itself.
  const otherDivision = await prisma.division.findFirst({
    where: { id: { not: division.id } },
    include: { teams: { take: 1 } },
  });
  if (otherDivision?.teams[0]) {
    check(
      "the team picker carries both leagues so filtering needs no reload",
      adjHtml.includes(`value="${otherDivision.teams[0].id}"`) &&
        adjHtml.includes(`value="${otherDivision.id}"`),
      otherDivision.name,
    );
    check("the league filter is not a separate submit step", !adjHtml.includes("Apply filter"));
  }

  console.log("\nSeason ranking rule");
  const tbBefore = await prisma.season.findUniqueOrThrow({
    where: { id: season.id },
    select: { tiebreakerMode: true },
  });
  await submit("/admin/league", `id="tiebreak-${season.id}"`, {
    seasonId: season.id,
    tiebreakerMode: "POINTS_PER_GAME",
  });
  const tbAfter = await prisma.season.findUniqueOrThrow({
    where: { id: season.id },
    select: { tiebreakerMode: true },
  });
  check(
    "an admin can rank a season on points per game",
    tbAfter.tiebreakerMode === "POINTS_PER_GAME",
    tbAfter.tiebreakerMode,
  );
  check(
    "the ranking change is audited",
    (await prisma.auditLog.count({
      where: { action: "season.tiebreaker", entityId: season.id },
    })) > 0,
  );
  await submit("/admin/league", `id="tiebreak-${season.id}"`, {
    seasonId: season.id,
    tiebreakerMode: tbBefore.tiebreakerMode,
  });

  const headline = `Smoke news ${stamp}`;
  await submit("/admin/content", 'id="ann-title"', {
    title: headline,
    summary: "Smoke summary",
    body: "Smoke body",
    seasonId: "",
  });
  const announcement = await prisma.announcement.findFirst({ where: { title: headline } });
  check("createAnnouncementAction publishes", announcement !== null);

  console.log("\nMatch Control shell");
  const matchesHtml = await (await req("/admin/matches")).text();
  check(
    "the active admin tab is flagged for assistive tech",
    matchesHtml.includes('aria-current="page"'),
  );
  check(
    "fixtures list matchweek before kick-off",
    matchesHtml.includes(">MW<") && matchesHtml.indexOf(">MW<") < matchesHtml.indexOf("Kick-off"),
  );
  check("the fixture list offers a CSV export", matchesHtml.includes("/admin/schedule.csv"));
  check(
    "upcoming-only is the default filter",
    /<option value="upcoming"[^>]*selected/.test(matchesHtml),
  );
  check("the venue picker is gone from Add a fixture", !matchesHtml.includes('id="new-venue"'));
  check("the fixture table has no separate score column", !matchesHtml.includes(">Score<"));
  {
    // A played fixture reads as "Home 2–1 Away" on one line; an unplayed one
    // reads "Home vs Away". Both need visible space around the middle token,
    // which is why the separator is a flex gap rather than literal whitespace.
    const played = await prisma.match.findFirst({
      where: { seasonId: season.id, divisionId: division.id, report: { isNot: null } },
      include: { report: true, homeTeam: true, awayTeam: true },
    });
    if (played?.report) {
      const withResult = await (await req(`/admin/matches?season=${season.id}&when=all`)).text();
      check(
        "a played fixture shows its score inline",
        withResult.includes(`${played.report.homeScore}\u2013${played.report.awayScore}`),
        `${played.homeTeam.name} ${played.report.homeScore}-${played.report.awayScore} ${played.awayTeam.name}`,
      );
      check("an unplayed fixture reads as a versus line", withResult.includes(">vs<"));
      check(
        "team names are separated by a layout gap, not collapsing whitespace",
        withResult.includes("gap-x-2"),
      );
    }
  }

  const csv = await req(`/admin/schedule.csv?season=${season.id}`);
  const csvBody = await csv.text();
  check("CSV export downloads", csv.status === 200, `status ${csv.status}`);
  const exportHeader = csvBody.split("\n")[0]?.trim() ?? "";
  check(
    "CSV export carries every column the importer requires",
    ["matchweek", "kickoff", "division", "home", "away", "venue"].every((c) =>
      exportHeader.split(",").includes(c),
    ),
    exportHeader,
  );
  // The real claim is "the export is a valid import template", so feed the
  // exported file straight back through the importer's dry run.
  const roundTrip = await submit("/admin/import", 'id="import-csv"', {
    csv: csvBody.split("\n").slice(0, 4).join("\n"),
    seasonId: season.id,
    mode: "dry-run",
  });
  const roundTripHtml = roundTrip.html;
  check(
    "the exported file re-imports without header errors",
    !roundTripHtml.includes("CSV header is missing"),
  );

  console.log("\nCSV schedule import");
  const goodRow = `${MW},2030-06-01T18:00:00Z,${division.name},${division.teams[0].name},${division.teams[1].name},Smoke Pitch`;
  // A club the register has never heard of is no longer an error: the importer
  // enrols it. Only genuinely unreadable input — a kick-off it cannot parse —
  // still fails a row.
  const newTeamRow = `${MW},2030-06-01T20:00:00Z,${division.name},Nobody FC,${division.teams[1].name},Smoke Pitch`;
  const brokenRow = `${MW},not-a-date,${division.name},${division.teams[2].name},${division.teams[3].name},Smoke Pitch`;
  const header = "matchweek,kickoff,division,home,away,venue";

  const dry = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}\n${newTeamRow}`,
    seasonId: season.id,
    mode: "dry-run",
  });
  const untouched = await prisma.match.count({ where: { matchweek: MW } });
  check("dry run writes nothing", untouched === 0, `status ${dry.status}`);
  check(
    "the dry run previews the club it will enrol",
    dry.html.includes("Nobody FC") && dry.html.includes("Will be added to the league"),
  );

  const refused = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}\n${brokenRow}`,
    seasonId: season.id,
    mode: "commit",
  });
  const stillUntouched = await prisma.match.count({ where: { matchweek: MW } });
  check(
    "commit refuses the whole batch while any row errors",
    stillUntouched === 0 && refused.html.includes("Fix every row error"),
  );

  await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}`,
    seasonId: season.id,
    mode: "commit",
  });
  const imported = await prisma.match.count({ where: { matchweek: MW } });
  check("a clean batch imports", imported === 1, `${imported} fixture(s)`);

  const dupe = await submit("/admin/import", 'id="import-csv"', {
    csv: `${header}\n${goodRow}`,
    seasonId: season.id,
    mode: "commit",
  });
  const afterDupe = await prisma.match.count({ where: { matchweek: MW } });
  check(
    "re-importing the same row is skipped as a duplicate",
    afterDupe === 1 && dupe.html.includes("Nothing new to import"),
  );

  {
    // The two complaints that made a real admin's import unusable: a US-style
    // kick-off and a division nobody had created. Neither may block an import
    // any more. The venue column is free text: whatever is typed lands on
    // the match verbatim, with nothing created and nothing validated.
    const tolerant = await submit("/admin/import", 'id="import-csv"', {
      csv: [
        header,
        `${MW + 1},8/5/2030 5:30 pm,Sunday Invitational,Rovers Athletic,Harbour Town,A Field Nobody Registered`,
      ].join("\n"),
      seasonId: season.id,
      mode: "dry-run",
    });
    check(
      "a month-first kick-off parses",
      !tolerant.html.includes("unreadable kick-off"),
      "8/5/2030 5:30 pm",
    );
    check(
      "an unknown division is enrolled rather than rejected",
      tolerant.html.includes("Sunday Invitational") && !tolerant.html.includes("unknown division"),
    );
    check("the importer accepts a file as well as pasted text", dry.html.includes('type="file"'));

    const committed = await submit("/admin/import", 'id="import-csv"', {
      csv: [
        header,
        `${MW + 1},8/5/2030 5:30 pm,Sunday Invitational,Rovers Athletic,Harbour Town,A Field Nobody Registered`,
      ].join("\n"),
      seasonId: season.id,
      mode: "commit",
    });
    const enrolled = await prisma.match.findFirst({
      where: { seasonId: season.id, matchweek: MW + 1 },
      include: { division: true, homeTeam: true, awayTeam: true },
    });
    check(
      "committing enrols the division, both clubs and the fixture",
      enrolled?.division.name === "Sunday Invitational" &&
        enrolled?.homeTeam.name === "Rovers Athletic" &&
        enrolled?.awayTeam.name === "Harbour Town",
      `status ${committed.status} → ${enrolled?.division.name ?? "no fixture created"}`,
    );
    check(
      "an imported venue lands on the match exactly as typed",
      enrolled?.venueName === "A Field Nobody Registered",
      enrolled?.venueName ?? "null",
    );
    check(
      "an enrolled club is given a kit that does not clash with its opponent",
      Boolean(enrolled) &&
        !kitsClash(
          resolveKit(enrolled!.homeTeam, enrolled!.homeKit),
          resolveKit(enrolled!.awayTeam, enrolled!.awayKit),
        ),
    );
  }

  console.log("\nKit selection");
  const importedMatch = await prisma.match.findFirst({ where: { matchweek: MW } });
  if (importedMatch) {
    // The importer picks kits itself, so a CSV that carries no colour column
    // still produces a playable, non-clashing fixture.
    const homeTeam = await prisma.team.findUniqueOrThrow({
      where: { id: importedMatch.homeTeamId },
      select: { colorPrimary: true, colorAlternate: true },
    });
    const awayTeam = await prisma.team.findUniqueOrThrow({
      where: { id: importedMatch.awayTeamId },
      select: { colorPrimary: true, colorAlternate: true },
    });
    check(
      "CSV import puts the home side in its own primary kit",
      importedMatch.homeKit === "PRIMARY",
      `${importedMatch.homeKit}`,
    );
    check(
      "CSV import picks an away kit that does not clash",
      !kitsClash(
        resolveKit(homeTeam, importedMatch.homeKit),
        resolveKit(awayTeam, importedMatch.awayKit),
      ),
      `${importedMatch.homeKit} vs ${importedMatch.awayKit}`,
    );

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
  // Divisions and teams are standing members of the league, not entries in one
  // year's competition. An admin deleting a season must lose that season's
  // fixtures and nothing else — this used to cascade away the entire register.
  const clubsBefore = await prisma.team.count();
  const divisionsBefore = await prisma.division.count();
  await submit("/admin/league", `Type ${doomedSeason.name} to confirm deletion`, {
    confirmName: doomedSeason.name,
  });
  check(
    "deleteSeasonAction removes an inactive season",
    (await prisma.season.count({ where: { id: doomedSeason.id } })) === 0,
  );
  const clubsAfter = await prisma.team.count();
  const divisionsAfter = await prisma.division.count();
  check(
    "deleting a season leaves every club standing",
    clubsAfter === clubsBefore,
    `${clubsBefore} → ${clubsAfter}`,
  );
  check(
    "deleting a season leaves every division standing",
    divisionsAfter === divisionsBefore,
    `${divisionsBefore} → ${divisionsAfter}`,
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
      action: { in: ["team.create", "announcement.create", "schedule.import"] },
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
