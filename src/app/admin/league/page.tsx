import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { TeamColorBar } from "@/components/team-colors";
import { Card, Field, inputClass } from "@/components/ui";
import {
  activateSeasonAction,
  createDivisionAction,
  createSeasonAction,
  createTeamAction,
  createVenueAction,
  deleteSeasonAction,
  deleteTeamAction,
} from "@/app/admin/actions";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "League setup" };

export default async function AdminLeaguePage() {
  const active = await getActiveSeason();

  const [seasons, divisions, teams, venues] = await Promise.all([
    prisma.season.findMany({ orderBy: { startsOn: "desc" } }),
    prisma.division.findMany({
      where: active ? { seasonId: active.id } : undefined,
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { teams: true } } },
    }),
    prisma.team.findMany({
      where: active ? { division: { seasonId: active.id } } : undefined,
      orderBy: { name: "asc" },
      include: { division: { select: { name: true } } },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
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
          Divisions in {active?.name ?? "no active season"}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle divide-y">
            {divisions.length === 0 ? (
              <p className="text-muted p-4 text-sm">No divisions yet.</p>
            ) : (
              divisions.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 text-sm">
                  <span>{d.name}</span>
                  <span className="text-muted text-xs">{d._count.teams} team(s)</span>
                </div>
              ))
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New division</h3>
            <ActionForm action={createDivisionAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Season" htmlFor="div-season">
                <select
                  id="div-season"
                  name="seasonId"
                  defaultValue={active?.id ?? ""}
                  className={inputClass}
                  required
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
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
                <div key={team.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamColorBar team={team} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate">{team.name}</span>
                      <span className="text-muted block text-xs">{team.division.name}</span>
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <a href={`/teams/${team.id}`} className="text-muted text-xs underline">
                      View
                    </a>
                    <ActionForm
                      action={deleteTeamAction}
                      resetOnSuccess={false}
                      className="flex flex-col items-end gap-1"
                    >
                      <input type="hidden" name="teamId" value={team.id} />
                      <input
                        name="confirmName"
                        aria-label={`Type ${team.name} to confirm deletion`}
                        placeholder={`Type “${team.name}”`}
                        className={`${inputClass} w-40 text-xs`}
                        required
                      />
                      <SubmitButton
                        variant="danger"
                        confirm={`Delete ${team.name} and its unplayed fixtures? This cannot be undone.`}
                      >
                        Delete team
                      </SubmitButton>
                    </ActionForm>
                  </div>
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
                <input
                  id="team-color-primary"
                  name="colorPrimary"
                  type="color"
                  defaultValue="#0f766e"
                  className="border-subtle h-10 w-full cursor-pointer rounded-lg border bg-transparent p-1"
                />
                <FieldError name="colorPrimary" />
              </Field>
              <Field
                label="Alternate colour"
                htmlFor="team-color-alternate"
                hint="Worn when the kits would clash."
              >
                <input
                  id="team-color-alternate"
                  name="colorAlternate"
                  type="color"
                  defaultValue="#ffffff"
                  className="border-subtle h-10 w-full cursor-pointer rounded-lg border bg-transparent p-1"
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

      {/* --------------------------------- Venues --------------------------- */}
      <section aria-labelledby="venues">
        <h2 id="venues" className="mb-3 text-lg font-semibold">
          Venues
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle divide-y">
            {venues.map((venue) => (
              <div key={venue.id} className="p-3 text-sm">
                <p className="font-medium">{venue.name}</p>
                <p className="text-muted text-xs">
                  {[venue.address, venue.city].filter(Boolean).join(", ") || "No address recorded"}
                </p>
              </div>
            ))}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New venue</h3>
            <ActionForm action={createVenueAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="venue-name">
                <input id="venue-name" name="name" className={inputClass} required />
                <FieldError name="name" />
              </Field>
              <Field label="City" htmlFor="venue-city">
                <input id="venue-city" name="city" className={inputClass} />
              </Field>
              <Field label="Address" htmlFor="venue-address">
                <input id="venue-address" name="address" className={inputClass} />
              </Field>
              <Field label="Map URL" htmlFor="venue-map">
                <input id="venue-map" name="mapUrl" className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>Create venue</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </section>
    </div>
  );
}
