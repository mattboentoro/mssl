# Microsoft Soccer League (MSSL)

League management and public site for the Microsoft Soccer League, replacing the
internal SharePoint site at `teams/MicrosoftSoccerLeagueMSSL`.

The whole point of the app is one flow:

> A referee with an explicit application-database role signs in, claims
> a match (claiming _is_ the lock), and submits the game report — and the
> standings recompute from that report.

Everything else (schedule, teams, rules, stats, admin) exists to support that.

---

## Quick start

No Azure resources, no app registration, no network access required.

```powershell
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

### Team logo storage

Team logos use a private Azure Blob container and are read through
`/teams/<team-id-or-slug>/logo`; storage credentials are never sent to the
browser. Set `AZURE_STORAGE_CONNECTION_STRING` and optionally
`AZURE_STORAGE_TEAM_LOGO_CONTAINER` (defaults to `team-logos`).

For local development, run [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite)
on its default ports and use:

```dotenv
AZURE_STORAGE_CONNECTION_STRING="UseDevelopmentStorage=true"
AZURE_STORAGE_TEAM_LOGO_CONTAINER="team-logos"
```

The application creates the container with private access on first use. In
Azure, store the connection string in the app's secret configuration rather
than in source control.

Open <http://localhost:3000>. The site is fully browsable anonymously.

### Importing a schedule from CSV

The repository includes `tests/MSSL schedule.csv` as a realistic import fixture.
To load it into the local database:

1. Start the site with `npm run dev` and open <http://localhost:3000/signin>.
2. Sign in as the `admin` development persona.
3. Open <http://localhost:3000/admin/matches> and select **Upload CSV**.
4. Choose the target season and upload `tests/MSSL schedule.csv`.
5. Select **Dry run**. Review every row and resolve any errors.
6. Select **Import valid rows** to save the fixtures.

The expected columns are `matchweek`, `kickoff`, `division`, `home`, `away`,
`venue`, and the optional `counts` column. Kick-off values without an offset are
interpreted as Redmond/Pacific time. A blank `counts` value includes the fixture
in standings; use `no` for a final, play-off, or friendly that must not affect
the table.

The import is all-or-nothing when a row has an error. Existing fixtures with the
same matchweek, home team, and away team are treated as duplicates and skipped.
After import, the database is the runtime source of truth: editing the CSV does
not update the site automatically. To revise individual fixtures, use
<http://localhost:3000/admin/matches>. For bulk additions, download the current
season from **Match Control → Download CSV**, edit the exported file, and import
it again.

To exercise the privileged flows, go to **/signin** and use the dev bypass
personas (enabled by `DEV_AUTH_BYPASS=true`, hard-disabled when
`NODE_ENV=production`):

| Persona    | Signs in as               | Role    |
| ---------- | ------------------------- | ------- |
| `referee`  | riley.whistle@example.com | referee |
| `referee2` | sam.sideline@example.com  | referee |
| `admin`    | alex.board@example.com    | admin   |
| `viewer`   | casey.fan@example.com     | viewer  |

Then walk the critical path:

1. `/referee` — pick an unclaimed match, **Claim this match**.
2. Fill in the game report (final score, forfeits, cards) and **Submit**.
3. `/standings` — both teams' rows have moved.

### Roles at a glance

| Role                   | Can do                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public** (anonymous) | Standings for both divisions (**Premier League** and **First Division**), match dates and fixture details, team pages, rules.                                                                                                                                                                                                                                    |
| **Referee**            | Claim a match, read the pre-match **warning board**, input the score, input disciplinary actions.                                                                                                                                                                                                                                                                |
| **Player / Captain**   | See season-scoped team context. Captain and roster workflow surfaces build on these database assignments.                                                                                                                                                                                                                                                        |
| **Game Administrator** | Create **and delete** a season, add **and delete** a team (with its two kit colours), choose which kit each side wears in a fixture, add a disciplinary result (which reaches the referee taking the game as a warning), **override a score**, **deduct or restore league points**, plus divisions, venues, the schedule, report confirmation and the audit log. |

### Verifying it without a browser

```powershell
npm run dev          # terminal 1
npm run smoke        # terminal 2 — the full referee flow
npm run smoke:admin  #              Match Control
```

`npm run smoke` drives the real HTTP API: anonymous redirect, referee-vs-admin
authorization, dev sign-in, self-assignment, a **losing concurrent claim
(HTTP 409)**, claim ownership, rejected invalid reports, submission,
immutability, and the resulting standings delta. `npm run smoke:admin` drives the
admin server actions over the progressive-enhancement path (CRUD, discipline
register, CSV dry run/commit, audit trail).

---

## Architecture

```
Next.js 16 App Router (React 19, TypeScript strict, Tailwind v4)
├── src/app/                    routes — RSC by default
│   ├── (public)                /, /schedule, /standings, /teams, /rules,
│   │                           /faq
│   ├── referee/                Referee Control (referee role)
│   ├── admin/                  Match Control + audit (admin role)
│   └── api/                    route handlers, all runtime = "nodejs"
├── src/lib/                    all business logic, framework-free where possible
│   ├── standings.ts            PURE calculator — no I/O, heavily unit tested
│   ├── kits.ts                 PURE kit colour resolution + clash check
│   ├── matches.ts              claim / submit / confirm state machine
│   ├── authz.ts                database-backed role and team guards
│   ├── rbac.ts                 identity claim, roles and team membership
│   └── validation.ts           every Zod schema
├── prisma/schema.prisma        12 models
└── tests/                      Vitest — 76 tests
```

### Request → role resolution

```mermaid
flowchart LR
  A[Sign in] --> B{DEV_AUTH_BYPASS?}
  B -- yes --> C[Credentials persona]
  B -- no --> D[Microsoft Entra ID OIDC]
  C --> E[JWT callback]
  D --> E
  E --> F[Claim AppUser by immutable Entra object ID]
  F --> G[Load database roles and team contexts]
  G --> H[Server guard reloads authorization]
```

Entra authenticates the user but does not authorize application actions. Roles
are cumulative and non-hierarchical in the application database. Every server
guard reloads roles and season/team contexts and fails closed if that lookup fails.
Set `MSSL_BOOTSTRAP_ADMIN_OBJECT_IDS` to one or more immutable Entra object IDs
to establish the first administrator; subsequent assignments are managed at
`/admin/users`.

There is deliberately **no `middleware.ts`**: Prisma cannot run on the Edge
runtime, so every route handler and page does its own server-side authorization
via `requireReferee()` / `requireAdmin()`. Client-side role state is never
trusted.

### Match lifecycle

```
SCHEDULED ──claim──▶ ASSIGNED ──report──▶ REPORT_SUBMITTED
     ▲                   │                        │
     └─────release───────┘                  confirm│dispute
       (referee, before the report;                ▼
        admin, any time)                      CONFIRMED
```

**Claiming a match _is_ locking it.** There is no separate lock step: once a
referee holds a fixture, nobody else can claim it, and the assignment can only be
reversed by that referee (before the report is filed) or by an admin.

`POSTPONED`, `CANCELLED` and `FORFEIT` are terminal side states set by an admin.

**Self-assignment is race-safe.** `assignRefereeToMatch` performs a single
conditional `updateMany` guarded by `refereeId: null` **and** the expected
`version`, incrementing `version` in the same statement. If it affects zero rows
the match is re-read: either the caller already owned it (idempotent success) or
another referee won, and the caller gets **HTTP 409**. Two concurrent referees
can never both hold the same match — `tests/match-lifecycle.test.ts` proves it,
and `npm run smoke` proves it over real HTTP.

### Standings

`src/lib/standings.ts` is a pure function: matches + reports in, table out. It
performs no I/O, which is why it is cheap to test exhaustively.

- 3 points for a win, 1 for a draw, 0 for a loss.
- Counts `CONFIRMED` reports always; `REPORT_SUBMITTED` reports only when
  `STANDINGS_INCLUDE_UNCONFIRMED=true` (the default, so a freshly submitted
  report shows up immediately).
- Tiebreakers, in order: **points → goal difference → goals for → head-to-head →
  fewest disciplinary points**.
- Forfeits award `STANDINGS_FORFEIT_SCORE` (default `3-0`).
- Columns P/W/D/L/GF/GA/GD/Pts plus a last-5 form guide.

Results are **never** hand-editable. The only way to change what a team earned on
the pitch is to change a game report, and every such change is audited.

#### Ranking on points per game

Some seasons end with teams having played a different number of matches, and
ranking those on total points rewards whoever has played most rather than
whoever has performed best. A Game Administrator can switch a **particular
season** to rank on points per game from the season list in `/admin/league`; the
choice is stored on `Season.tiebreakerMode` and audited.

Every other tiebreaker is unchanged — only the first comparison swaps.

Two implementation details worth knowing:

- The comparison **cross-multiplies** (`b.points * a.played` against
  `a.points * b.played`) rather than dividing. Two teams on 4 points from 3 games
  and 8 from 6 are therefore exactly level and fall through to goal difference.
  Dividing would compare `1.333…` against `1.333…` and let floating-point
  rounding decide a league position.
- A team that has played **no** matches has no rate at all, so it sorts below
  anyone on positive points and above anyone left negative by a deduction.

The setting is read from the season row inside `getStandingsForSeason`, so the
public table, the home-page snippet and the admin console cannot disagree about
how the same season is ranked.

#### Points adjustments

A league administrator can apply a sanction at **Match Control → Standings**
(`/admin/standings`). This does not edit any result. It stores a signed
`PointsAdjustment` row — negative deducts, positive restores — with a mandatory
reason, and the calculator applies it after all match arithmetic:

- The adjustment shows on the public table beside that team's points total, so a
  deduction can never be mistaken for a bug.
- P/W/D/L, GF/GA/GD and the form guide are untouched. A deduction is not a result.
- The head-to-head tiebreaker ledger is untouched too — that mini-league is about
  what happened on the pitch.
- Adjustments are reversible from the same page. Both applying and reversing are
  audited.

---

## Data model

| Model                | Notes                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Season`             | Has many divisions; one is flagged current. `tiebreakerMode` picks whether the table ranks on total points or points per game.                                                                                                                                       |
| `Division`           | Belongs to a season; owns teams. Two per season.                                                                                                                                                                                                                     |
| `Team`               | Belongs to a **division** (a team reaches its season via division). Registers a **primary** and an **alternate** kit colour as hex.                                                                                                                                  |
| `Venue`              | Shared across seasons.                                                                                                                                                                                                                                               |
| `Referee`            | Mirrors an Entra user; auto-provisioned on first referee sign-in.                                                                                                                                                                                                    |
| `Match`              | `status`, `refereeId`, `assignedAt`, `homeKit`/`awayKit`, `version` (OCC).                                                                                                                                                                                           |
| `GameReport`         | One-to-one with `Match` (unique `matchId`); immutable once filed.                                                                                                                                                                                                    |
| `DisciplinaryAction` | A yellow or red card. Free-text `playerName`, optional minute, `issuedBy: REFEREE \| ADMIN`. Links to a report/match when it came from a game report, or to the season and team alone when an admin issued it as a league sanction.                                  |
| `Announcement`       | Optional season scope; pinned items surface on the home page.                                                                                                                                                                                                        |
| `Document`           | Rules, waivers, downloads.                                                                                                                                                                                                                                           |
| `PointsAdjustment`   | An administrative sanction against a team: signed `points`, mandatory `reason`, and who applied it. Applied by the standings calculator after all match arithmetic; never edits a result. A team belongs to one division in one season, so `teamId` alone scopes it. |
| `AuditLog`           | Every mutating privileged action.                                                                                                                                                                                                                                    |

There is deliberately **no `Player` model and no squad lists.** The league does
not want to maintain rosters, so a referee types the offender's name as free text
when filing a card.

### Kit colours

Every team registers two colours. A fixture stores only **which kit each side
wears** (`PRIMARY` or `ALTERNATE`), never a hex value — so re-colouring a team in
`/admin/league` instantly updates every fixture it appears in, past and future.
Defaults are home = primary, away = alternate.

`src/lib/kits.ts` is a pure, tested module: `resolveKit()` turns a team plus a
choice into a hex, `kitsClash()` flags two kits that are too close to tell apart
(RGB distance below `0.25`), and `readableTextOn()` picks black or white text via
the WCAG luminance formula. The admin kit pickers show live swatches and warn on a
clash; the seed script uses the same rule to pick each away kit.

`pickKitsForFixture()` applies the league's preference automatically: **both
sides wear their home crest**, and the away team is moved to its alternate only
when the two primaries would clash. CSV schedule imports run every row through
it, so a bulk upload can't produce a fixture where both teams turn up in the same
colour. An administrator can still override either side afterwards.

The old emoji crest is gone. Team badges are now a two-tone disc drawn from the
team's own two colours with its short-name initials on top, so visual identity
comes from real data rather than an arbitrary emoji field.

---

## Referee Control (`/referee`)

- **Available matches** — unclaimed fixtures, filterable by date, division and
  venue, as a list **or a month calendar**.
- **Preview before claiming** — every fixture on the calendar links to its detail
  page, not just the ones already assigned. A referee can open an unclaimed match
  to see the teams, kick-off in Redmond time and **which colour each side will
  wear**, then claim it from there. Judging a fixture from a one-line list entry
  was not enough to decide whether to take it.
- **Claim** — `POST /api/matches/[id]/assign`, race-safe (above). Claiming is the
  lock: the fixture is now that referee's and nobody else can take it.
- **Warning board** — once the fixture is theirs, the referee sees every player
  on either side carrying a card this season, worst first, with any league
  sanction the Game Administrator has issued pinned to the top. This is how an
  administrator's disciplinary decision reaches the official who has to enforce
  it.
- **Release** — `POST /api/matches/[id]/unassign`. Allowed for the assigned
  referee **until the report is filed**; afterwards only an admin can reverse it.
- **Submit report** — `POST /api/matches/[id]/report`. Zod enforces non-negative
  integer scores, plausible minutes, and cards that name one of the two teams. On
  success the match becomes `REPORT_SUBMITTED` and the report is immutable to the
  referee.
- **My matches** — claimed / submitted history.

Goalscorers are **not** tracked — only the final score and any cards.

The report form is mobile-first: referees file from a phone at the pitch.

## Match Control (`/admin`)

- `/admin/matches` — create a fixture (choosing both teams **and which kit each
  wears**, with a live clash warning), reschedule, postpone, cancel, change the
  kits later, assign or force-unassign a referee, confirm/dispute a report,
  override a result with a mandatory reason. Available as a table or a **month
  calendar**; the table leads with the matchweek, the whole row links to that
  fixture's manage page, and it defaults to **upcoming fixtures only** so the
  page opens on work still to come rather than months of finished results.
  **Download CSV** exports the current season's fixtures — see below.
- `/admin/league` — CRUD for seasons, divisions, teams, venues. Teams carry a
  primary and alternate kit colour, picked with a native colour input.
  **Deletes** live here too, and are guarded:
  - A **season** can be deleted only when it is not the active one, and only
    after typing its name. It cascades to its divisions, teams, fixtures and
    reports, so activate another season first.
  - A **team** can be deleted only after typing its name, and never once any of
    its fixtures has a filed game report — results are not rewritten. Deleting a
    team also removes its unplayed fixtures and its discipline record.
  - Both write an `AuditLog` row recording exactly what was removed.
- `/admin/discipline` — the league discipline register: record a card or sanction
  against a team (free-text player name, optional fixture, optional minute), or
  rescind one. Admin-issued rows are tagged `ADMIN`, surface on the **referee's
  warning board** for that team's next fixture, and count towards the standings
  tiebreaker. Rows that arrived on a game report are tagged `REFEREE`.
- **Upload CSV** on `/admin/matches` — bulk CSV schedule import with a
  **dry-run preview**, in a banner opened by the button next to Download CSV.
  Columns: `matchweek`, `kickoff`, `division`, `home`, `away`, `venue`, and
  optional `counts`. Matchweek is free text, and kick-off accepts ISO-like or
  month-first values interpreted in Redmond time. Teams and divisions match by
  name, slug or short name. Kits are assigned automatically per fixture (see
  [Kit colours](#kit-colours)). The commit is **all-or-nothing**: if any row
  still errors nothing is written. Rows matching an existing fixture (same
  matchweek, same two teams) are skipped as duplicates.
- `/admin/schedule.csv?season=<id>` — exports the season's fixtures. The export
  is **a valid import template**: download it, edit or append rows, and feed it
  straight back into the Upload CSV dialog. The admin smoke test proves the
  round trip rather than asserting a fixed header string.
- `/admin/content` — announcements and documents.
- `/admin/standings` — apply or reverse a **points adjustment** against a team,
  filtered by league so a deduction can't land on the right name in the wrong
  division. Deductions and awards are stored separately from results, shown on
  the public table with their reason, and never touch what was earned on the
  pitch. See [Points adjustments](#points-adjustments).
- `/admin/audit` — filterable, paged audit log viewer.

The active section is marked with `aria-current="page"` so it is obvious which
part of Match Control is open.

Every mutating admin action writes an `AuditLog` row.

---

## Entra ID app registration

The dev bypass exists so you can skip all of this locally. For a real
deployment:

1. **Azure portal → Microsoft Entra ID → App registrations → New registration.**
   - Name: `MSSL Website`
   - Supported account types: _Accounts in this organizational directory only_
   - Redirect URI: **Web** →
     `http://localhost:3000/api/auth/callback/microsoft-entra-id`
2. Add the production redirect URI too:
   `https://<your-host>/api/auth/callback/microsoft-entra-id`
3. **Certificates & secrets → New client secret.** Copy the _value_ into
   `AUTH_MICROSOFT_ENTRA_ID_SECRET`.
4. Copy **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID` and
   **Directory (tenant) ID** → `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`.
5. **API permissions → Add a permission → Microsoft Graph → Delegated**, add:
   `openid`, `profile`, `email`, `offline_access`, and `User.Read`.
6. Copy the first administrator's immutable Entra object ID into
   `MSSL_BOOTSTRAP_ADMIN_OBJECT_IDS`. After that account signs in, use
   **Admin → Users & roles** for role management.

---

## SQLite → Azure PostgreSQL

Local dev uses SQLite for zero setup. The schema is deliberately portable — no
SQLite-only constructs — but the Prisma `provider` must be a literal, so
switching is a two-line edit plus fresh migrations:

1. `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your flexible-server connection string
   (`postgresql://user:pass@host:5432/mssl?sslmode=require`).
3. Delete `prisma/migrations/` and run `npx prisma migrate dev --name init`
   against a dev database, then `npx prisma migrate deploy` in the pipeline.
4. `npm run seed` if you want sample data.

Enum-like columns are plain `String`s with TypeScript unions in
`src/lib/enums.ts`, and `AuditLog.metadata` is JSON stored as text — both work
identically on PostgreSQL. If you want native enums and `jsonb` on PostgreSQL
you can promote them, but nothing requires it.

## Deploying to Azure

**App Service (Linux, Node 22)**

```powershell
az webapp up --name mssl-web --runtime "NODE:22-lts" --sku B1
az webapp config appsettings set --name mssl-web --resource-group <rg> --settings `
  AUTH_SECRET=<...> AUTH_URL=https://mssl-web.azurewebsites.net AUTH_TRUST_HOST=true `
  AUTH_MICROSOFT_ENTRA_ID_ID=<...> AUTH_MICROSOFT_ENTRA_ID_SECRET=<...> `
  AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<...> DATABASE_URL=<...> `
  MSSL_BOOTSTRAP_ADMIN_OBJECT_IDS=<entra-object-id> DEV_AUTH_BYPASS=false
```

Startup command: `npx prisma migrate deploy && npm run start`.

**Container Apps** — build from a standard Next.js `output: "standalone"` image,
run `prisma migrate deploy` as an init container, and put the same settings in a
secret-backed environment.

Checklist for any production environment:

- `NODE_ENV=production` (this alone disables the dev bypass) **and**
  `DEV_AUTH_BYPASS=false` as belt-and-braces.
- `AUTH_SECRET` from `npx auth secret` — never the placeholder.
- `AUTH_URL` + `AUTH_TRUST_HOST=true` behind the Azure proxy.
- Both redirect URIs registered in Entra.
- Managed identity for PostgreSQL if you would rather not ship a password.

---

## Development

```powershell
npm run dev            # dev server
npm run build          # production build (stop `npm run dev` first — see below)
npm test               # vitest, 76 tests
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run format         # prettier --write
npm run seed           # reseed the dev database
npm run db:studio      # prisma studio
```

Tests cover the standings calculator (every tiebreaker, forfeits, form guide,
the unconfirmed-report flag) and the match lifecycle (race-safe claiming, claim
ownership, report validation, immutability, admin discipline).

> **Windows note:** `npm run build` fails with `EPERM` on the Prisma query-engine
> DLL while a dev server holds it open. Stop `npm run dev` first.

---

## Assumptions

Ambiguous product decisions, resolved and recorded rather than escalated.

1. **Next.js 16, not 15.** The npm registry available here is an Azure Artifacts
   proxy that only serves cached versions; `next@15.x` returned 403. Next 16 is
   the same App Router programming model. If you need 15, the only code change
   is dropping `experimental.authInterrupts` (see #10).
2. **Enums are `String` columns**, with the unions in `src/lib/enums.ts`. Prisma
   does not support `enum` on SQLite, and this keeps one schema working on both
   engines.
3. **`AuditLog.metadata` is JSON text**, not a `Json` column, for the same
   reason. `writeAudit` / `parseAuditMetadata` wrap it.
4. **`STANDINGS_INCLUDE_UNCONFIRMED` defaults to `true`** so a referee's freshly
   submitted report is immediately visible in the table. Set it to `false` if
   the league wants an admin to confirm every result first.
5. **Forfeits award 3-0** (`STANDINGS_FORFEIT_SCORE`). A **double forfeit is
   0-0** and awards no points to either side.
6. **Disciplinary points: yellow = 1, red = 3.** Used as the final standings
   tiebreaker and to rank the team disciplinary records shown on team pages.
7. **Claiming a match is the lock.** There is no separate lock step. A referee
   may **release** a match they claimed by mistake right up until they file the
   report; after that only an admin can reverse it.
8. **No squads, no goalscorers.** The league does not want to maintain rosters,
   so there is no `Player` model. A referee names a carded player as free text,
   and the game report captures the final score only — not who scored.
9. **Disciplinary records are admin-writable, publicly readable.** Only
   `/admin/discipline` can add or rescind a sanction, but each team's card
   history is visible on its public team page.
10. **Two divisions per season: Premier League (8 teams) and First Division (7
    teams).** Nothing in the schema enforces the number or the names; add more in
    `/admin/league` if the league grows. Because First Division has an odd team
    count, the seed's round-robin generator gives one team a **bye** each
    matchweek rather than inventing a fixture.
11. **Kit is stored as a choice, not a hex.** `Match.homeKit` / `Match.awayKit`
    hold `PRIMARY` or `ALTERNATE`; the colour is always resolved from the team
    record at read time. Re-colouring a team therefore never leaves a fixture
    showing last season's shirt. The cost is that a genuine one-off third kit
    cannot be recorded — add a `colorThird` and a third enum value if that ever
    comes up.
12. **The kit-clash check is plain RGB distance**, not a perceptual metric like
    CIEDE2000. It is a touchline sanity check, not colour science, and it is
    advisory: the admin can save a clashing pair anyway.
13. **Deleting is guarded, not soft.** There is no "archived" flag. A team with
    any filed game report cannot be deleted at all, and the active season cannot
    be deleted, which covers the cases where a delete would corrupt the record.
    Everything else is a hard delete after typing the name to confirm.
14. **The warning board groups on a folded player name** (trimmed, lower-cased)
    because names are free text. "Hugo Diaz" and " hugo diaz " are one player.
    Two genuinely different people with the same name on the same team would
    merge — acceptable for a rec league, and the alternative is the roster
    maintenance the league explicitly does not want.
15. **CSV import is all-or-nothing on errors.** Partial imports of a half-valid
    file cause more cleanup than they save. Duplicates are skipped silently.
16. **JWT session strategy, no Prisma adapter.** Required for the
    Credentials-based dev bypass, and it keeps role resolution in one place.
17. **`experimental.authInterrupts` is enabled** so denied requests return a real
    **403** via `forbidden()` instead of rendering a 200 with an error panel.
18. **Roles are database-authoritative.** Entra proves identity only. Referee
    access requires both an explicit Referee role and an active linked record;
    Admin does not imply Referee.
19. **Matchweeks are capped at 60**, which is well beyond any plausible season
    and catches typos in CSV imports.
20. **No `middleware.ts`.** Prisma needs the Node runtime; authorization lives in
    `requireReferee()` / `requireAdmin()` at every entry point instead.
21. **Rules are a PDF, not prose.** `/rules` embeds the league's published
    handbook straight from `public/documents/mssl-rules-and-regulations.pdf`
    rather than restating it — the board owns that document, so mirroring it in
    markup would only create a second version to keep in sync. Replace the file
    to publish a new edition; the page falls back to a "not published yet"
    notice with a SharePoint link when it is missing. The FAQ at `src/app/faq`
    is real league copy; announcements in `/admin/content` are still seeded
    placeholders.
22. **Every time is Redmond time, everywhere.** `Match.kickoffAt` is stored as
    UTC, but the league has one home and nobody should have to think about
    offsets. `src/lib/timezone.ts` converts at the edges: a CSV upload and the
    admin fixture form both read their input as `America/Los_Angeles` with **no
    timezone suffix required**, and every rendered time is formatted back into
    it. Daylight saving is handled by the `Intl` API, not by a fixed offset.
    The consequence to be aware of is that calendar month boundaries must be
    computed in league time — `zonedToUtc(year, month, 1)`, never `Date.UTC` —
    because a fixture's UTC date and its Redmond date routinely differ.
23. **Points per game cross-multiplies rather than divides.** See
    [Ranking on points per game](#ranking-on-points-per-game). Integer
    arithmetic means two genuinely equal rates compare as equal and fall through
    to goal difference, instead of a floating-point rounding artefact silently
    deciding a league position. A team with zero matches played has no rate at
    all and is ordered explicitly.
24. **Match Control opens on upcoming fixtures only.** An administrator arriving
    at `/admin/matches` is almost always there to do something about a fixture
    that has not happened yet. Past results are one click away and the filter is
    in the query string, so a link to a specific view still works.
25. **The schedule export is the import template.** Rather than ship a separate
    blank template that can drift out of sync with the parser, the export is the
    template: download, edit, re-upload. It carries an extra optional `venue`
    column that the importer tolerates, and the admin smoke test proves the
    round trip instead of asserting a header string.
26. **CSV imports pick kits automatically.** Bulk uploads have no place to state
    what each side wears, so `pickKitsForFixture()` puts both teams in their home
    crest and moves the away side to its alternate only on a clash. An
    administrator can override either side afterwards.
