/**
 * End-to-end smoke test of the critical referee flow against a running dev server.
 *
 *   npm run dev          # in one terminal
 *   npm run smoke        # in another
 *
 * Exercises: dev sign-in -> preview a fixture -> self-assign (with a losing concurrent
 * claim) -> reject an inconsistent report -> submit a valid report -> confirm the report
 * is immutable -> confirm standings recomputed from that report.
 *
 * Requires DEV_AUTH_BYPASS=true and seeded data. It mutates the dev database.
 */
import { kitColorName, resolveKit } from "../src/lib/kits";
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

async function postJson(path: string, body: unknown) {
  const res = await req(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, body: parsed };
}

function check(label: string, passed: boolean, detail = ""): boolean {
  if (!passed) failures += 1;
  const mark = passed ? "\u2713" : "\u2717";
  console.log(`  ${mark} ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  return passed;
}

function snippet(value: unknown, max = 220): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "").slice(0, max);
}

async function signIn(persona: string): Promise<Record<string, unknown> | null> {
  jar.clear();
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await req("/api/auth/callback/dev-bypass", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      persona,
      csrfToken,
      callbackUrl: `${BASE}/referee`,
      json: "true",
    }),
  });
  const session = (await (await req("/api/auth/session")).json()) as {
    user?: Record<string, unknown>;
  };
  return session.user ?? null;
}

function snapshot(cookies: Map<string, string>): Array<[string, string]> {
  return [...cookies.entries()];
}

function restore(entries: Array<[string, string]>): void {
  jar.clear();
  for (const [k, v] of entries) jar.set(k, v);
}

async function pointsFor(seasonId: string, teamId: string) {
  const table = await getStandingsForSeason(seasonId);
  for (const division of table) {
    const row = division.rows.find((r) => r.teamId === teamId);
    if (row) return { points: row.points, played: row.played, goalsFor: row.goalsFor };
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`MSSL referee flow smoke test against ${BASE}\n`);

  console.log("Access control");
  const anon = await req("/referee");
  check("anonymous /referee redirects to sign-in", anon.status === 307, `status ${anon.status}`);
  const anonAdmin = await req("/admin/matches");
  check(
    "anonymous /admin/matches is blocked",
    anonAdmin.status === 307 || anonAdmin.status === 403,
    `status ${anonAdmin.status}`,
  );

  // Who is refereeing is league-internal: a signed-out visitor sees the fixture
  // but not the official's name.
  const assigned = await prisma.match.findFirst({
    where: { referee: { isNot: null } },
    include: { referee: { select: { name: true } } },
  });
  if (assigned?.referee) {
    const anonSchedule = await (await req("/schedule")).text();
    check(
      "signed-out schedule hides the assigned referee",
      !anonSchedule.includes(assigned.referee.name),
      assigned.referee.name,
    );
  }

  console.log("\nSign-in (dev bypass)");
  const user = await signIn("referee");
  check("dev sign-in returns a session", Boolean(user?.email), String(user?.email ?? "none"));
  check("session carries the referee role", user?.isReferee === true);
  const refereePage = await req("/referee");
  check("/referee renders", refereePage.status === 200, `status ${refereePage.status}`);
  const adminAsRef = await req("/admin/matches");
  check(
    "referee cannot reach /admin/matches",
    adminAsRef.status === 307 || adminAsRef.status === 403,
    `status ${adminAsRef.status}`,
  );

  // Pick a fresh unassigned fixture straight from the database.
  const match = await prisma.match.findFirst({
    where: { refereeId: null, status: "SCHEDULED" },
    orderBy: { kickoffAt: "asc" },
    include: {
      homeTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
      awayTeam: { select: { id: true, name: true, colorPrimary: true, colorAlternate: true } },
    },
  });

  if (!match) {
    console.log("\nNo unassigned SCHEDULED match available. Re-run `npm run seed` first.");
    process.exitCode = 1;
    return;
  }

  console.log(`\nFixture: ${match.homeTeam.name} v ${match.awayTeam.name} (${match.id})`);
  const beforeHome = await pointsFor(match.seasonId, match.homeTeamId);
  const beforeAway = await pointsFor(match.seasonId, match.awayTeamId);

  console.log("\nPreview before claiming");
  const calendar = await (await req("/referee?view=calendar")).text();
  check(
    "the referee calendar links every fixture, not just their own",
    calendar.includes(`/referee/${match.id}`),
  );
  // Assignments and open fixtures are separate questions -- "when am I
  // working?" versus "what could I pick up?" -- so each section carries its own
  // view, and switching one must not reset the other.
  const splitViews = await (await req("/referee?view=list&myView=calendar")).text();
  check(
    "the assignments section has its own calendar view",
    splitViews.includes("Your calendar") && splitViews.includes("Available matches"),
  );
  check(
    "switching the assignments view keeps the open-fixture view",
    calendar.includes("myView=calendar") && splitViews.includes("view=calendar"),
  );
  // League fixtures run on Sundays, so a Monday-first grid pushed every match
  // to the far edge of the row.
  const sundayFirst = calendar.indexOf(">Sun<");
  const mondaySecond = calendar.indexOf(">Mon<");
  check(
    "the calendar week starts on Sunday",
    sundayFirst !== -1 && mondaySecond > sundayFirst,
    `Sun@${sundayFirst} Mon@${mondaySecond}`,
  );
  // The open-match list has to name the kit colours too, not just show a
  // swatch: a phone screen in daylight makes two dark circles look identical.
  const openList = await (await req("/referee")).text();
  const homeKitText = `${match.homeTeam.name} (${kitColorName(resolveKit(match.homeTeam, match.homeKit)).toLowerCase()})`;
  const awayKitText = `${match.awayTeam.name} (${kitColorName(resolveKit(match.awayTeam, match.awayKit)).toLowerCase()})`;
  check(
    "the open-match list names each side's kit colour inline",
    openList.includes(homeKitText) && openList.includes(awayKitText),
    `${homeKitText} / ${awayKitText}`,
  );
  check(
    "the fixture name itself links to the match detail",
    openList.includes(`/referee/${match.id}`) && !openList.includes("View match details"),
  );
  // A row cap on this list used to disagree with the calendar, which has never
  // been capped: the list stopped partway through the season while the month
  // grid kept showing fixtures beyond it. The heading count proves the list is
  // whole.
  const openCount = await prisma.match.count({
    where: { seasonId: match.seasonId, refereeId: null, status: "SCHEDULED" },
  });
  check(
    "the available list is not truncated",
    openCount > 0 && openList.includes(`(${openCount})`),
    `${openCount} open fixture(s)`,
  );
  check(
    "every open fixture is actually rendered",
    (
      await prisma.match.findMany({
        where: { seasonId: match.seasonId, refereeId: null, status: "SCHEDULED" },
        select: { id: true },
      })
    ).every((m) => openList.includes(`/referee/${m.id}`)),
  );
  const preview = await (await req(`/referee/${match.id}`)).text();
  check("an unclaimed fixture is previewable", preview.includes(match.homeTeam.name));
  check("the preview offers a claim action", preview.includes("Claim this match"));
  check(
    "the preview shows what colour each side wears",
    preview.includes(kitColorName(resolveKit(match.homeTeam, match.homeKit))) &&
      preview.includes(kitColorName(resolveKit(match.awayTeam, match.awayKit))),
    `${kitColorName(resolveKit(match.homeTeam, match.homeKit))} / ${kitColorName(resolveKit(match.awayTeam, match.awayKit))}`,
  );

  console.log("\nSelf-assign (claiming is the lock)");
  const assign = await postJson(`/api/matches/${match.id}/assign`, {
    expectedVersion: match.version,
  });
  check("self-assign succeeds", assign.status === 200, snippet(assign.body));
  const refereeOneCookies = snapshot(jar);

  console.log("\nConcurrency guard");
  await signIn("referee2");
  const steal = await postJson(`/api/matches/${match.id}/assign`, {});
  check("a second referee gets 409", steal.status === 409, `status ${steal.status}`);
  const stealReport = await postJson(`/api/matches/${match.id}/report`, {
    homeScore: 1,
    awayScore: 0,
  });
  check(
    "a second referee cannot file the report",
    stealReport.status === 403,
    `status ${stealReport.status}`,
  );
  const stealRelease = await postJson(`/api/matches/${match.id}/unassign`, {});
  check(
    "a second referee cannot release the match",
    stealRelease.status === 403,
    `status ${stealRelease.status}`,
  );
  restore(refereeOneCookies);

  console.log("\nGame report");
  const payload = {
    homeScore: 2,
    awayScore: 1,
    homeForfeit: false,
    awayForfeit: false,
    notes: "Automated smoke-test report.",
    cards: [
      {
        type: "YELLOW",
        teamId: match.awayTeamId,
        playerName: "Smoke Tester",
        minute: 80,
        note: "Dissent",
      },
      { type: "RED", teamId: match.homeTeamId, playerName: "Test Subject", minute: 88 },
    ],
  };

  const negativeScore = await postJson(`/api/matches/${match.id}/report`, {
    ...payload,
    homeScore: -1,
  });
  check(
    "a negative score is rejected",
    negativeScore.status === 400 || negativeScore.status === 422,
    `status ${negativeScore.status}`,
  );

  const wrongTeam = await postJson(`/api/matches/${match.id}/report`, {
    ...payload,
    cards: [
      { type: "YELLOW", teamId: "not-a-team-in-this-match", playerName: "Ghost", minute: 12 },
    ],
  });
  check(
    "a card for a team not in this fixture is rejected",
    wrongTeam.status === 400 || wrongTeam.status === 422,
    `status ${wrongTeam.status}`,
  );

  const submit = await postJson(`/api/matches/${match.id}/report`, payload);
  check(
    "valid report submits",
    submit.status === 200 || submit.status === 201,
    snippet(submit.body),
  );

  const resubmit = await postJson(`/api/matches/${match.id}/report`, payload);
  check("report is immutable to the referee", resubmit.status === 409, `status ${resubmit.status}`);

  const releaseAfterReport = await postJson(`/api/matches/${match.id}/unassign`, {});
  check(
    "referee cannot release once the report is filed",
    releaseAfterReport.status === 409 || releaseAfterReport.status === 403,
    `status ${releaseAfterReport.status}`,
  );

  const cardCount = await prisma.disciplinaryAction.count({ where: { matchId: match.id } });
  check("the report's cards were stored", cardCount === 2, `${cardCount} card(s)`);

  // The assignments calendar and the assignments list must always agree. They
  // once drifted -- the calendar ran its own query with no status filter, so a
  // referee with one live assignment saw every match they had ever worked.
  // Slicing the section out by its aria-labelledby keeps this honest: the
  // fixture is still linked further down under "Your history".
  const afterSubmit = await (await req("/referee?myView=calendar")).text();
  const myPanel = afterSubmit.slice(
    afterSubmit.indexOf('aria-labelledby="my-active"'),
    afterSubmit.indexOf('aria-labelledby="available"'),
  );
  check(
    "a submitted match leaves the assignments calendar",
    myPanel.length > 0 && !myPanel.includes(`/referee/${match.id}`),
  );
  check(
    "the submitted match is still reachable from the history list",
    afterSubmit.includes(`/referee/${match.id}`),
  );

  console.log("\nStandings recomputed from the report");
  const afterHome = await pointsFor(match.seasonId, match.homeTeamId);
  const afterAway = await pointsFor(match.seasonId, match.awayTeamId);
  check(
    "winner gains 3 points and a played match",
    Boolean(beforeHome && afterHome) &&
      afterHome!.points === beforeHome!.points + 3 &&
      afterHome!.played === beforeHome!.played + 1,
    `${beforeHome?.points}pts/${beforeHome?.played}p \u2192 ${afterHome?.points}pts/${afterHome?.played}p`,
  );
  check(
    "winner's goals-for increases by 2",
    Boolean(beforeHome && afterHome) && afterHome!.goalsFor === beforeHome!.goalsFor + 2,
    `${beforeHome?.goalsFor} \u2192 ${afterHome?.goalsFor}`,
  );
  check(
    "loser gains a played match but no points",
    Boolean(beforeAway && afterAway) &&
      afterAway!.points === beforeAway!.points &&
      afterAway!.played === beforeAway!.played + 1,
    `${beforeAway?.points}pts/${beforeAway?.played}p \u2192 ${afterAway?.points}pts/${afterAway?.played}p`,
  );

  console.log("\nPages still render");
  for (const path of ["/", "/standings", "/schedule", "/teams", `/referee/${match.id}`]) {
    const res = await req(path);
    check(`${path} returns 200`, res.status === 200, `status ${res.status}`);
  }

  console.log("\nAdmin confirmation");
  await signIn("admin");
  const adminPage = await req("/admin/matches");
  check("admin can reach Match Control", adminPage.status === 200, `status ${adminPage.status}`);
  const confirm = await postJson(`/api/matches/${match.id}/confirm`, {});
  check("admin can confirm the report", confirm.status === 200, snippet(confirm.body));
  const audit = await req("/admin/audit");
  check("audit log renders", audit.status === 200, `status ${audit.status}`);
  const discipline = await req("/admin/discipline");
  check("discipline register renders", discipline.status === 200, `status ${discipline.status}`);

  console.log(
    failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) FAILED.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
