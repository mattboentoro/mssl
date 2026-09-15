import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { TeamEditor } from "@/components/admin-team-editor";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { TeamColorBar } from "@/components/team-colors";
import { Card, Field, inputClass } from "@/components/ui";
import {
  activateSeasonAction,
  createDivisionAction,
  createSeasonAction,
  createTeamAction,
  deleteDivisionAction,
  deleteSeasonAction,
  setSeasonTiebreakerAction,
} from "@/app/admin/actions";
import { formatDate } from "@/lib/dates";
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
        <h2 id="seasons" className="mb-3 text-lg font-semibold">
          Seasons
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle divide-y">
            {seasons.map((season) => (
              <div key={season.id} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">
                    {season.name}
                    {season.isActive ? (
                      <span className="text-success ml-2 text-xs font-semibold">ACTIVE</span>
                    ) : null}
                  </p>
                  <p className="text-muted text-xs">
                    {formatDate(season.startsOn)} &ndash; {formatDate(season.endsOn)}
                  </p>
                  <ActionForm
                    action={setSeasonTiebreakerAction}
                    resetOnSuccess={false}
                    className="mt-2 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="seasonId" value={season.id} />
                    <label
                      htmlFor={`tiebreak-${season.id}`}
                      className="text-muted text-[11px] font-medium"
                    >
                      Ranked on
                    </label>
                    <select
                      id={`tiebreak-${season.id}`}
                      name="tiebreakerMode"
                      defaultValue={season.tiebreakerMode}
                      className={`${inputClass} w-auto py-1 text-xs`}
                    >
                      <option value="POINTS">Total points</option>
                      <option value="POINTS_PER_GAME">Points per game</option>
                    </select>
                    <SubmitButton variant="ghost">Save</SubmitButton>
                  </ActionForm>
                </div>
                {season.isActive ? (
                  <p className="text-muted max-w-40 text-right text-[11px]">
                    Activate another season before this one can be deleted.
                  </p>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    <ActionForm action={activateSeasonAction} resetOnSuccess={false}>
                      <input type="hidden" name="seasonId" value={season.id} />
                      <SubmitButton variant="ghost">Make active</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={deleteSeasonAction}
                      resetOnSuccess={false}
                      className="flex flex-col items-end gap-1"
                    >
                      <input type="hidden" name="seasonId" value={season.id} />
                      <input
                        name="confirmName"
                        aria-label={`Type ${season.name} to confirm deletion`}
                        placeholder={`Type “${season.name}”`}
                        className={`${inputClass} w-44 text-xs`}
                        required
                      />
                      <SubmitButton
                        variant="danger"
                        confirm={`Delete ${season.name} and every division, team, fixture and report inside it? This cannot be undone.`}
                      >
                        Delete season
                      </SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New season</h3>
            <ActionForm action={createSeasonAction} className="grid gap-3 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <SubmitButton>Create season</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </section>

      {/* ------------------------------- Divisions -------------------------- */}
      <section aria-labelledby="divisions">
        <h2 id="divisions" className="mb-3 text-lg font-semibold">
          Divisions
        </h2>
        <p className="text-muted mb-3 text-sm">
          Divisions and the clubs inside them belong to the league, not to a season. Deleting a
          season removes its fixtures and leaves every team standing.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle divide-y">
            {divisions.length === 0 ? (
              <p className="text-muted p-4 text-sm">No divisions yet.</p>
            ) : (
              divisions.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div>
                    <p>{d.name}</p>
                    <p className="text-muted text-xs">
                      {d._count.teams} team(s), {d._count.matches} fixture(s)
                    </p>
                  </div>
                  {/*
                    Deleting a division takes its clubs and their fixtures with
                    it, so the name has to be retyped. The action refuses
                    outright once any of those fixtures has a filed report.
                  */}
                  <ActionForm
                    action={deleteDivisionAction}
                    resetOnSuccess={false}
                    className="flex flex-col items-end gap-1"
                  >
                    <input type="hidden" name="divisionId" value={d.id} />
                    <input
                      name="confirmName"
                      aria-label={`Type ${d.name} to confirm deletion`}
                      placeholder={`Type “${d.name}”`}
                      className={`${inputClass} w-44 text-xs`}
                      required
                    />
                    <SubmitButton
                      variant="danger"
                      confirm={`Delete ${d.name}, its ${d._count.teams} club(s) and ${d._count.matches} fixture(s)? This cannot be undone.`}
                    >
                      Delete division
                    </SubmitButton>
                  </ActionForm>
                </div>
              ))
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New division</h3>
            <ActionForm action={createDivisionAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="div-name">
                <input id="div-name" name="name" className={inputClass} required />
                <FieldError name="name" />
              </Field>
              <Field label="Sort order" htmlFor="div-sort">
                <input
                  id="div-sort"
                  name="sortOrder"
                  type="number"
                  min={0}
                  defaultValue={divisions.length}
                  className={inputClass}
                />
              </Field>
              <div className="flex items-end">
                <SubmitButton>Create division</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </section>

      {/* --------------------------------- Teams ---------------------------- */}
      <section aria-labelledby="teams">
        <h2 id="teams" className="mb-3 text-lg font-semibold">
          Teams
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle max-h-96 divide-y overflow-y-auto">
            {teams.length === 0 ? (
              <p className="text-muted p-4 text-sm">No teams yet.</p>
            ) : (
              teams.map((team) => (
                <div key={team.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <TeamColorBar team={team} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate">{team.name}</span>
                        <span className="text-muted block text-xs">{team.division.name}</span>
                      </span>
                    </span>
                    <a href={`/teams/${team.id}`} className="text-muted shrink-0 text-xs underline">
                      View
                    </a>
                  </div>
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
                </div>
              ))
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New team</h3>
            <ActionForm action={createTeamAction} className="grid gap-3 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <SubmitButton>Create team</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </section>
    </div>
  );
}
