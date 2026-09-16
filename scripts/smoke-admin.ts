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
import { toDateTimeInputValue } from "../src/lib/dates";
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

  // Matchweek is free text, so label the smoke fixtures with something no real
  // schedule will collide with. The import checks claim two slots.
  const MW = `smoke-${stamp}`;
  const MW2 = `smoke-${stamp}-b`;
  await prisma.match.deleteMany({ where: { matchweek: { in: [MW, MW2] } } });

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

  // A club's address is league-wide now, so the same name in a different
  // division has to be refused rather than quietly shadowing the first club.
  const rivalDivision = await prisma.division.findFirst({ where: { id: { not: division.id } } });
  if (rivalDivision) {
    const clash = await submit("/admin/league", 'id="team-name"', {
      divisionId: rivalDivision.id,
      name: teamName,
      shortName: "SMK",
    });
    const clones = await prisma.team.count({ where: { name: teamName } });
    check(
      "the same club name cannot be reused in another division",
      clones === 1 && clash.html.includes("already uses the web address"),
      `${clones} team(s) named ${teamName}`,
    );
  }

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
    // The filter sits directly above the picker, so naming the league on every
    // option just repeated it back at the admin.
    check(
      "team options are not suffixed with their league",
      !adjHtml.includes(`${otherDivision.teams[0].name} &#x2014; ${otherDivision.name}`) &&
        !adjHtml.includes(`${otherDivision.teams[0].name} — ${otherDivision.name}`),
    );
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

  // The number a season ranks on has to be on screen. Anything else asks the
  // reader to take the order on faith.
  const ppgPublic = await (await req("/standings")).text();
  const ppgHome = await (await req("/")).text();
  const ppgAdmin = await (await req("/admin/standings")).text();
  check("a points-per-game season shows a PPG column publicly", ppgPublic.includes(">PPG<"));
  check("the home page snapshot shows it too", ppgHome.includes(">PPG<"));
  check("and the admin table shows it", ppgAdmin.includes(">PPG<"));
  check(
    "the tiebreaker note does not repeat the ranking metric",
    !ppgPublic.includes("separated by points per game"),
  );

  await submit("/admin/league", `id="tiebreak-${season.id}"`, {
    seasonId: season.id,
    tiebreakerMode: tbBefore.tiebreakerMode,
  });
  check(
    "a points-ranked season carries no PPG column",
    !(await (await req("/standings")).text()).includes(">PPG<"),
  );

  const headline = `Smoke news ${stamp}`;
  await submit("/admin/content", 'id="ann-title"', {
    title: headline,
    summary: "Smoke summary",
    body: "Smoke body",
    seasonId: "",
  });
  const announcement = await prisma.announcement.findFirst({ where: { title: headline } });
  check("createAnnouncementAction publishes", announcement !== null);
  if (announcement) {
    const editedHeadline = `${headline} edited`;
    await submit("/admin/content", `id="ann-${announcement.id}-title"`, {
      announcementId: announcement.id,
      title: editedHeadline,
      slug: announcement.slug,
      summary: "Updated smoke summary",
      body: "Updated smoke body",
      seasonId: season.id,
      pinned: "on",
    });
    const editedAnnouncement = await prisma.announcement.findUnique({
      where: { id: announcement.id },
    });
    check(
      "updateAnnouncementAction edits all publishable fields",
      editedAnnouncement?.title === editedHeadline &&
        editedAnnouncement.summary === "Updated smoke summary" &&
        editedAnnouncement.body === "Updated smoke body" &&
        editedAnnouncement.seasonId === season.id &&
        editedAnnouncement.pinned,
    );
    check(
      "announcement updates are audited",
      (await prisma.auditLog.count({
        where: { action: "announcement.update", entityId: announcement.id },
      })) === 1,
    );
  }

  const documentTitle = `Smoke document ${stamp}`;
  await submit("/admin/content", 'id="doc-title"', {
    title: documentTitle,
    category: "OTHER",
    url: "/faq",
    fileType: "Page",
    description: "Smoke document",
    sortOrder: "99",
  });
  const document = await prisma.document.findFirst({ where: { title: documentTitle } });
  check("createDocumentAction adds a document", document !== null);
  if (document) {
    await submit("/admin/content", `id="doc-${document.id}-title"`, {
      documentId: document.id,
      title: `${documentTitle} edited`,
      category: "POLICY",
      url: "/rules",
      fileType: "Link",
      description: "Updated smoke document",
      sortOrder: "98",
    });
    const editedDocument = await prisma.document.findUnique({ where: { id: document.id } });
    check(
      "updateDocumentAction edits all document fields",
      editedDocument?.title === `${documentTitle} edited` &&
        editedDocument.category === "POLICY" &&
        editedDocument.url === "/rules" &&
        editedDocument.fileType === "Link" &&
        editedDocument.description === "Updated smoke document" &&
        editedDocument.sortOrder === 98,
    );

    await submit("/admin/content", `id="delete-doc-${document.id}"`, {
      documentId: document.id,
    });
    check(
      "deleteDocumentAction removes the document",
      (await prisma.document.findUnique({ where: { id: document.id } })) === null,
    );
    check(
      "document deletion is audited",
      (await prisma.auditLog.count({
        where: { action: "document.delete", entityId: document.id },
      })) === 1,
    );
  }

  if (announcement) {
    await submit("/admin/content", `id="delete-ann-${announcement.id}"`, {
      announcementId: announcement.id,
    });
    check(
      "deleteAnnouncementAction removes the announcement",
      (await prisma.announcement.findUnique({ where: { id: announcement.id } })) === null,
    );
    check(
      "announcement deletion is audited",
      (await prisma.auditLog.count({
        where: { action: "announcement.delete", entityId: announcement.id },
      })) === 1,
    );
  }

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
  check(
    "Add a fixture takes a free-text venue, not a registry lookup",
    matchesHtml.includes('id="new-venue"') && !matchesHtml.includes('<select id="new-venue"'),
  );
  {
    // Offering the whole league in the team pickers made it trivial to schedule
    // a cross-division fixture by accident. The division select now lives
    // inside the picker so it can narrow both lists. Only the first render is
    // observable over HTTP -- the narrowing itself is client-side.
    const other = await prisma.division.findFirst({
      where: { id: { not: division.id } },
      include: { teams: { orderBy: { name: "asc" }, take: 1 } },
    });
    const form = matchesHtml.slice(matchesHtml.indexOf('id="new-division"'));
    const picker = form.slice(0, form.indexOf("</form>"));
    check("the division select sits inside the fixture picker", picker.includes('id="new-home"'));
    check(
      "Add a fixture takes a venue",
      form.includes('id="new-venue"') && form.includes('name="venueName"'),
    );
    if (other?.teams[0]) {
      check(
        "team pickers only offer clubs from the chosen division",
        !picker.includes(`value="${other.teams[0].id}"`),
        other.teams[0].name,
      );
    }
  }
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
    ["matchweek", "kickoff", "division", "home", "away", "venue", "counts"].every((c) =>
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
    // Matchweek is free text now, and a knockout tie must be importable
    // alongside the league season without moving the table.
    const cupWeek = `${MW}-cup`;
    await prisma.match.deleteMany({ where: { matchweek: cupWeek } });
    await submit("/admin/import", 'id="import-csv"', {
      csv: [
        `${header},counts`,
        `${cupWeek},2030-06-08T18:00:00Z,${division.name},${division.teams[0].name},${division.teams[2].name},Smoke Pitch,no`,
      ].join("\n"),
      seasonId: season.id,
      mode: "commit",
    });
    const cupTie = await prisma.match.findFirst({ where: { matchweek: cupWeek } });
    check("a non-numeric matchweek imports", Boolean(cupTie), cupTie?.matchweek ?? "not created");
    check(
      "the counts column keeps a cup tie out of the league table",
      cupTie?.countsForStandings === false,
      String(cupTie?.countsForStandings),
    );
    await prisma.match.deleteMany({ where: { matchweek: cupWeek } });
  }

  {
    // The two complaints that made a real admin's import unusable: a US-style
    // kick-off and a division nobody had created. Neither may block an import
    // any more. The venue column is free text: whatever is typed lands on
    // the match verbatim, with nothing created and nothing validated.
    const tolerant = await submit("/admin/import", 'id="import-csv"', {
      csv: [
        header,
        `${MW2},8/5/2030 5:30 pm,Sunday Invitational,Rovers Athletic,Harbour Town,A Field Nobody Registered`,
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
        `${MW2},8/5/2030 5:30 pm,Sunday Invitational,Rovers Athletic,Harbour Town,A Field Nobody Registered`,
      ].join("\n"),
      seasonId: season.id,
      mode: "commit",
    });
    const enrolled = await prisma.match.findFirst({
      where: { seasonId: season.id, matchweek: MW2 },
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

    // The panel posts the raw datetime-local value so the server can read it as
    // Redmond wall-clock time. Demanding an ISO offset here made every single
    // "Save schedule" 422 before the route ever ran.
    const WALL = "2031-03-09T19:45";
    const rescheduled = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kickoffAt: WALL,
        venueName: "Smoke Field 3",
        reason: "Smoke reschedule",
      }),
    });
    const moved = await prisma.match.findUnique({ where: { id: importedMatch.id } });
    check(
      "admin can reschedule using a wall-clock kick-off",
      rescheduled.status === 200 &&
        toDateTimeInputValue(moved?.kickoffAt ?? new Date(0)) === WALL &&
        moved?.venueName === "Smoke Field 3",
      `status ${rescheduled.status} \u2192 ${toDateTimeInputValue(moved?.kickoffAt ?? new Date(0))} @ ${moved?.venueName}`,
    );
    const unreadable = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoffAt: "next tuesday" }),
    });
    check(
      "an unreadable kick-off is still refused",
      unreadable.status === 400,
      `status ${unreadable.status}`,
    );

    // Fixtures entered against the wrong club must be correctable while no
    // report exists.
    const swapTo = await prisma.team.findFirst({
      where: {
        divisionId: importedMatch.divisionId,
        id: { notIn: [importedMatch.homeTeamId, importedMatch.awayTeamId] },
      },
    });
    if (swapTo) {
      const corrected = await req(`/api/matches/${importedMatch.id}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeTeamId: swapTo.id,
          awayTeamId: importedMatch.awayTeamId,
          reason: "Entered against the wrong club",
        }),
      });
      const fixed = await prisma.match.findUnique({ where: { id: importedMatch.id } });
      check(
        "admin can correct which clubs are playing",
        corrected.status === 200 && fixed?.homeTeamId === swapTo.id,
        `status ${corrected.status}`,
      );
      const selfPlay = await req(`/api/matches/${importedMatch.id}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ homeTeamId: swapTo.id, awayTeamId: swapTo.id }),
      });
      check(
        "a club cannot be set to play itself",
        selfPlay.status === 400,
        `status ${selfPlay.status}`,
      );
    }

    await signIn("referee");
    const denied = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeKit: "PRIMARY" }),
    });
    check("a referee cannot change kits", denied.status === 403, `status ${denied.status}`);
    await signIn("admin");

    console.log("\nAdmin result entry and non-league fixtures");
    // A referee who never files a report used to leave a fixture permanently
    // blank. An admin must be able to enter the result themselves.
    const detail = await (await req(`/admin/matches/${importedMatch.id}`)).text();
    check(
      "the result form is offered even with no report on file",
      detail.includes("Enter the result"),
    );
    check("the fixture can be flagged as non-league", detail.includes("countsForStandings"));
    check("matchweek is editable after creation", detail.includes('id="matchweek"'));

    const entered = await req(`/api/matches/${importedMatch.id}/override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        homeScore: 3,
        awayScore: 1,
        reason: "Referee never filed; result confirmed by both captains.",
      }),
    });
    const enteredReport = await prisma.gameReport.findUnique({
      where: { matchId: importedMatch.id },
    });
    check(
      "admin can enter a result on a fixture the referee never reported",
      enteredReport?.homeScore === 3 && enteredReport?.awayScore === 1,
      `status ${entered.status} \u2192 ${enteredReport?.homeScore}-${enteredReport?.awayScore}`,
    );
    const enterAudit = await prisma.auditLog.findFirst({
      where: { action: "report.enter", metadata: { contains: importedMatch.id } },
    });
    check("entering a result is audited separately from an override", Boolean(enterAudit));

    // Once a report names the clubs, moving them underneath it would orphan
    // every goal and card.
    const lateSwap = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ homeTeamId: importedMatch.awayTeamId }),
    });
    check(
      "clubs cannot be changed once a report exists",
      lateSwap.status === 409,
      `status ${lateSwap.status}`,
    );
    const guarded = await (await req(`/admin/matches/${importedMatch.id}`)).text();
    check(
      "the delete card explains itself when deletion is blocked",
      guarded.includes("Delete fixture") && guarded.includes("cannot be deleted"),
    );

    const flagged = await req(`/api/matches/${importedMatch.id}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchweek: "Final",
        countsForStandings: false,
        reason: "Cup final",
      }),
    });
    const reflagged = await prisma.match.findUnique({ where: { id: importedMatch.id } });
    check(
      "admin can retitle the matchweek and take a fixture out of the table",
      reflagged?.matchweek === "Final" && reflagged?.countsForStandings === false,
      `status ${flagged.status} \u2192 ${reflagged?.matchweek} / ${reflagged?.countsForStandings}`,
    );
    // Put it back so the clean-up delete still finds the row.
    await prisma.match.update({
      where: { id: importedMatch.id },
      data: { matchweek: MW, countsForStandings: true },
    });
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

  // A division that has already been played cannot be deleted: the standings
  // are derived from its reports, so losing it would silently rewrite history.
  const playedDivision = await prisma.division.findFirst({
    where: { matches: { some: { report: { isNot: null } } } },
  });
  if (playedDivision) {
    await submit("/admin/league", `Type ${playedDivision.name} to confirm deletion`, {
      confirmName: playedDivision.name,
    });
    check(
      "a division with filed reports refuses deletion",
      (await prisma.division.count({ where: { id: playedDivision.id } })) === 1,
    );
  }

  // The CSV import above enrolled a whole division on the fly. Deleting it
  // exercises the cascade *and* leaves the development database as the seed
  // left it, so a run of the smoke suite is not visible in the admin UI.
  const importedDivision = await prisma.division.findFirst({
    where: { name: "Sunday Invitational" },
    include: { _count: { select: { teams: true } } },
  });
  if (importedDivision) {
    await submit("/admin/league", `Type ${importedDivision.name} to confirm deletion`, {
      confirmName: "Not The Division",
    });
    check(
      "deleting a division refuses a mistyped name",
      (await prisma.division.count({ where: { id: importedDivision.id } })) === 1,
    );

    await submit("/admin/league", `Type ${importedDivision.name} to confirm deletion`, {
      confirmName: importedDivision.name,
    });
    check(
      "deleteDivisionAction removes the division",
      (await prisma.division.count({ where: { id: importedDivision.id } })) === 0,
    );
    check(
      "deleting a division takes its clubs with it",
      (await prisma.team.count({ where: { divisionId: importedDivision.id } })) === 0,
      `${importedDivision._count.teams} club(s) removed`,
    );
    check(
      "deleting a division takes its fixtures with it",
      (await prisma.match.count({ where: { divisionId: importedDivision.id } })) === 0,
    );
  }

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
  await prisma.match.deleteMany({ where: { matchweek: { in: [MW, MW2] } } });
  // The tolerant-import check enrols a throwaway division and two clubs.
  const smokeDivision = await prisma.division.findFirst({
    where: { name: "Sunday Invitational" },
  });
  if (smokeDivision) {
    await prisma.match.deleteMany({ where: { divisionId: smokeDivision.id } });
    await prisma.team.deleteMany({ where: { divisionId: smokeDivision.id } });
    await prisma.division.delete({ where: { id: smokeDivision.id } });
  }
  await prisma.team.deleteMany({ where: { name: "Nobody FC" } });
  if (team) await prisma.disciplinaryAction.deleteMany({ where: { teamId: team.id } });
  if (team) await prisma.team.deleteMany({ where: { id: team.id } });
  await prisma.season.deleteMany({ where: { id: doomedSeason.id } });
  if (announcement) await prisma.announcement.deleteMany({ where: { id: announcement.id } });

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
