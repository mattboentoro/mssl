# Microsoft Soccer League (MSSL)

League management and public site for the Microsoft Soccer League, replacing the
internal SharePoint site at `teams/MicrosoftSoccerLeagueMSSL`.

The whole point of the app is one flow:

> A referee who belongs to the **`msslrefs`** distribution list signs in, claims
> a match (claiming *is* the lock), and submits the game report — and the
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

Open <http://localhost:3000>. The site is fully browsable anonymously.

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

| Role                   | Can do                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| **Public** (anonymous) | Standings for both divisions, fixtures, results, team pages, rules.   |
| **Referee** (`msslrefs`) | Claim a match, file the score and any disciplinary cards.           |
| **Game Administrator** | Everything above plus seasons, divisions, teams, venues, the schedule, the discipline register, report confirmation and the audit log. |

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
│   │                           /contact
│   ├── referee/                Referee Control (referee role)
│   ├── admin/                  Match Control + audit (admin role)
│   └── api/                    route handlers, all runtime = "nodejs"
├── src/lib/                    all business logic, framework-free where possible
│   ├── standings.ts            PURE calculator — no I/O, heavily unit tested
│   ├── matches.ts              claim / submit / confirm state machine
│   ├── authz.ts                requireReferee(), requireAdmin()
│   ├── graph.ts                Microsoft Graph group membership
│   └── validation.ts           every Zod schema
├── prisma/schema.prisma        12 models
└── tests/                      Vitest — 63 tests
```

### Request → role resolution

```mermaid
flowchart LR
  A[Sign in] --> B{DEV_AUTH_BYPASS?}
  B -- yes --> C[Credentials persona]
  B -- no --> D[Microsoft Entra ID OIDC]
  C --> E[JWT callback]
  D --> E
  E --> F["Graph POST /me/checkMemberGroups"]
  F --> G{msslrefs member?}
  G -- yes --> H[role = referee]
  G -- no --> I[role = viewer]
  E --> J{admin group or UPN allowlist?}
  J -- yes --> K[role = admin]
```

Roles are cached on the JWT for `ROLE_CACHE_TTL_MS` (5 minutes) and re-checked on
every privileged action. `msslrefs` is a **distribution list**, so membership can
only come from Graph — it is never present in token group claims.

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

**Claiming a match *is* locking it.** There is no separate lock step: once a
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

Standings are **never** hand-editable. The only way to change the table is to
change a game report, and every such change is audited.

---

## Data model

| Model                | Notes                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `Season`             | Has many divisions; one is flagged current.                         |
| `Division`           | Belongs to a season; owns teams. Two per season.                    |
| `Team`               | Belongs to a **division** (a team reaches its season via division). |
| `Venue`              | Shared across seasons.                                              |
| `Referee`            | Mirrors an Entra user; auto-provisioned on first referee sign-in.   |
| `Match`              | `status`, `refereeId`, `assignedAt`, `version` (OCC).               |
| `GameReport`         | One-to-one with `Match` (unique `matchId`); immutable once filed.   |
| `DisciplinaryAction` | A yellow or red card. Free-text `playerName`, optional minute, `issuedBy: REFEREE \| ADMIN`. Links to a report/match when it came from a game report, or to the season and team alone when an admin issued it as a league sanction. |
| `Announcement`       | Optional season scope; pinned items surface on the home page.       |
| `Document`           | Rules, waivers, downloads.                                          |
| `AuditLog`           | Every mutating privileged action.                                   |

There is deliberately **no `Player` model and no squad lists.** The league does
not want to maintain rosters, so a referee types the offender's name as free text
when filing a card.

---

## Referee Control (`/referee`)

- **Available matches** — unclaimed fixtures, filterable by date, division and
  venue.
- **Claim** — `POST /api/matches/[id]/assign`, race-safe (above). Claiming is the
  lock: the fixture is now that referee's and nobody else can take it.
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

- `/admin/matches` — reschedule, postpone, cancel, assign or force-unassign a
  referee, confirm/dispute a report, override a result with a mandatory reason.
- `/admin/league` — CRUD for seasons, divisions, teams, venues.
- `/admin/discipline` — the league discipline register: record a card or sanction
  against a team (free-text player name, optional fixture, optional minute), or
  rescind one. Admin-issued rows are tagged `ADMIN`; rows that arrived on a game
  report are tagged `REFEREE`.
- `/admin/import` — bulk CSV schedule import with a **dry-run preview**.
  Columns: `matchweek` (1-60), `kickoff` (ISO 8601), `division`, `home`, `away`,
  `venue` (optional). Teams and divisions match by name, slug or short name.
  The commit is **all-or-nothing**: if any row still errors nothing is written.
  Rows matching an existing fixture (same matchweek, same two teams) are skipped
  as duplicates.
- `/admin/content` — announcements and documents.
- `/admin/audit` — filterable, paged audit log viewer.

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
   `openid`, `profile`, `email`, `offline_access`, `User.Read`,
   **`GroupMember.Read.All`**.
6. Click **Grant admin consent**. `GroupMember.Read.All` requires it — without
   consent every user silently resolves to `viewer`.

### Finding the `msslrefs` group object ID

Portal: **Entra ID → Groups → All groups**, search `msslrefs`, copy the
**Object Id** into `MSSL_REFS_GROUP_ID`.

Or with the CLI:

```powershell
az ad group show --group msslrefs --query id -o tsv
```

Or Graph Explorer: `GET https://graph.microsoft.com/v1.0/groups?$filter=displayName eq 'msslrefs'`.

If `MSSL_REFS_GROUP_ID` is blank the app falls back to resolving the group by
display name (`MSSL_REFS_GROUP_NAME`, default `msslrefs`), which costs an extra
Graph call per resolution — set the ID in production.

Do the same for the admin security group → `MSSL_ADMIN_GROUP_ID`. A
comma-separated `MSSL_ADMIN_UPNS` allowlist also grants admin, which is handy
for bootstrapping before the group exists.

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
  MSSL_REFS_GROUP_ID=<...> MSSL_ADMIN_GROUP_ID=<...> DEV_AUTH_BYPASS=false
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
npm test               # vitest, 56 tests
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
10. **Two divisions per season** in the seed data. Nothing in the schema enforces
    the number; add more in `/admin/league` if the league grows.
11. **CSV import is all-or-nothing on errors.** Partial imports of a half-valid
    file cause more cleanup than they save. Duplicates are skipped silently.
12. **JWT session strategy, no Prisma adapter.** Required for the
    Credentials-based dev bypass, and it keeps role resolution in one place.
13. **`experimental.authInterrupts` is enabled** so denied requests return a real
    **403** via `forbidden()` instead of rendering a 200 with an error panel.
14. **Referee rows are auto-provisioned** on first sign-in by a `msslrefs`
    member, so no manual roster sync is needed.
15. **Matchweeks are capped at 60**, which is well beyond any plausible season
    and catches typos in CSV imports.
16. **No `middleware.ts`.** Prisma needs the Node runtime; authorization lives in
    `requireReferee()` / `requireAdmin()` at every entry point instead.
17. **Content is seeded, not migrated.** The old SharePoint site is
    auth-protected and could not be read, so rules, officers, FAQ and contact
    details are plausible placeholders — replace them in `/admin/content` and
    `src/app/rules` / `src/app/contact`.
