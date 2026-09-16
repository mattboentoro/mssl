import { FieldError } from "@/components/admin-forms";
import { DivisionEditor } from "@/components/admin-division-editor";
import { SeasonEditor } from "@/components/admin-season-editor";
import { TeamEditor } from "@/components/admin-team-editor";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { FormDialog } from "@/components/form-dialog";
import { TeamColorBar } from "@/components/team-colors";
import { Card, Field, inputClass } from "@/components/ui";
import { createDivisionAction, createSeasonAction, createTeamAction } from "@/app/admin/actions";
import { formatDate, toDateInputValue } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "League setup" };

export default async function AdminLeaguePage() {
  const [seasons, divisions, teams] = await Promise.all([
    prisma.season.findMany({ orderBy: { startsOn: "desc" } }),
    prisma.division.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { teams: true, matches: true } } },
    }),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { division: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      {/* -------------------------------- Seasons --------------------------- */}
      <section aria-labelledby="seasons">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="seasons" className="text-lg font-semibold">
            Seasons
          </h2>
          <FormDialog
            trigger="New season"
            title="New season"
            action={createSeasonAction}
            submitLabel="Create season"
          >
            <Field label="Name" htmlFor="season-name">
              <input id="season-name" name="name" className={inputClass} required />
              <FieldError name="name" />
            </Field>
            <Field label="Slug" htmlFor="season-slug" hint="Blank = derived from the name.">
              <input id="season-slug" name="slug" className={inputClass} />
              <FieldError name="slug" />
            </Field>
            <Field label="Starts" htmlFor="season-start">
              <input
                id="season-start"
                name="startsOn"
                type="date"
                className={inputClass}
                required
              />
              <FieldError name="startsOn" />
            </Field>
            <Field label="Ends" htmlFor="season-end">
              <input id="season-end" name="endsOn" type="date" className={inputClass} required />
              <FieldError name="endsOn" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="isActive" className="h-4 w-4" />
              Make this the active season
            </label>
          </FormDialog>
        </div>
        <ul className="space-y-3">
          {seasons.map((season) => (
            <Card
              as="li"
              key={season.id}
              className="flex items-start justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {season.name}
                  {season.isActive ? (
                    <span className="text-success ml-2 text-xs font-semibold">ACTIVE</span>
                  ) : null}
                </p>
                <p className="text-muted text-xs">
                  {formatDate(season.startsOn)} &ndash; {formatDate(season.endsOn)}
                </p>
                <p className="text-muted text-xs">
                  Ranked on{" "}
                  {season.tiebreakerMode === "POINTS_PER_GAME" ? "points per game" : "total points"}
                </p>
              </div>
              <SeasonEditor
                season={{
                  id: season.id,
                  name: season.name,
                  slug: season.slug,
                  startsOn: toDateInputValue(season.startsOn),
                  endsOn: toDateInputValue(season.endsOn),
                  isActive: season.isActive,
                  tiebreakerMode: season.tiebreakerMode,
                }}
              />
            </Card>
          ))}
        </ul>
      </section>

      {/* ------------------------------- Divisions -------------------------- */}
      <section aria-labelledby="divisions">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="divisions" className="text-lg font-semibold">
            Divisions
          </h2>
          <FormDialog
            trigger="New division"
            title="New division"
            action={createDivisionAction}
            submitLabel="Create division"
          >
            <Field label="Name" htmlFor="div-name">
              <input id="div-name" name="name" className={inputClass} required />
              <FieldError name="name" />
            </Field>
          </FormDialog>
        </div>
        <p className="text-muted mb-3 text-sm">
          Divisions and the clubs inside them belong to the league, not to a season. Deleting a
          season removes its fixtures and leaves every team standing.
        </p>
        {divisions.length === 0 ? (
          <Card className="p-4">
            <p className="text-muted text-sm">No divisions yet.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {divisions.map((d) => (
              <Card
                as="li"
                key={d.id}
                className="flex items-start justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-muted text-xs">
                    {d._count.teams} team(s), {d._count.matches} fixture(s)
                  </p>
                </div>
                <DivisionEditor
                  division={{
                    id: d.id,
                    name: d.name,
                    slug: d.slug,
                    sortOrder: d.sortOrder,
                    teamCount: d._count.teams,
                    matchCount: d._count.matches,
                  }}
                />
              </Card>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------- Teams ---------------------------- */}
      <section aria-labelledby="teams">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="teams" className="text-lg font-semibold">
            Teams
          </h2>
          <FormDialog
            trigger="New team"
            title="New team"
            action={createTeamAction}
            submitLabel="Create team"
          >
            <Field label="Division" htmlFor="team-division">
              <select id="team-division" name="divisionId" className={inputClass} required>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name" htmlFor="team-name">
              <input id="team-name" name="name" className={inputClass} required />
              <FieldError name="name" />
            </Field>
            <Field label="Short name" htmlFor="team-short">
              <input id="team-short" name="shortName" maxLength={24} className={inputClass} />
              <FieldError name="shortName" />
            </Field>
            <Field
              label="Web address"
              htmlFor="team-slug"
              hint="The club's page lives at /teams/<this>. Leave it blank to build one from the name."
            >
              <input id="team-slug" name="slug" className={inputClass} placeholder="rcs-united" />
              <FieldError name="slug" />
            </Field>
            <Field
              label="Primary colour"
              htmlFor="team-color-primary"
              hint="Home / first-choice kit."
            >
              <ColorPalettePicker
                name="colorPrimary"
                defaultValue="#0f766e"
                labelledBy="team-color-primary"
              />
              <FieldError name="colorPrimary" />
            </Field>
            <Field
              label="Alternate colour"
              htmlFor="team-color-alternate"
              hint="Worn when the kits would clash."
            >
              <ColorPalettePicker
                name="colorAlternate"
                defaultValue="#ffffff"
                labelledBy="team-color-alternate"
              />
              <FieldError name="colorAlternate" />
            </Field>
            <Field label="Captain" htmlFor="team-captain">
              <input id="team-captain" name="captainName" className={inputClass} />
            </Field>
            <Field label="Contact e-mail" htmlFor="team-email">
              <input id="team-email" name="contactEmail" type="email" className={inputClass} />
              <FieldError name="contactEmail" />
            </Field>
          </FormDialog>
        </div>
        {teams.length === 0 ? (
          <Card className="p-4">
            <p className="text-muted text-sm">No teams yet.</p>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => (
              <Card
                as="li"
                key={team.id}
                className="flex items-start justify-between gap-3 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TeamColorBar team={team} size="sm" />
                  <span className="min-w-0">
                    <a
                      href={`/teams/${team.slug}`}
                      className="hover:text-brand block truncate font-medium hover:underline"
                    >
                      {team.name}
                    </a>
                    <span className="text-muted block text-xs">{team.division.name}</span>
                  </span>
                </span>
                <TeamEditor
                  team={{
                    id: team.id,
                    name: team.name,
                    slug: team.slug,
                    shortName: team.shortName,
                    divisionId: team.divisionId,
                    colorPrimary: team.colorPrimary,
                    colorAlternate: team.colorAlternate,
                    captainName: team.captainName,
                    contactEmail: team.contactEmail,
                  }}
                  divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
                />
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
