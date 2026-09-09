import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { Card, Field, inputClass } from "@/components/ui";
import {
  activateSeasonAction,
  createDivisionAction,
  createPlayerAction,
  createSeasonAction,
  createTeamAction,
  createVenueAction,
  togglePlayerAction,
} from "@/app/admin/actions";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getActiveSeason } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "League setup" };

export default async function AdminLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const params = await searchParams;
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
      include: { division: { select: { name: true } }, _count: { select: { players: true } } },
    }),
    prisma.venue.findMany({ orderBy: { name: "asc" } }),
  ]);

  const selectedTeamId = params.team ?? teams[0]?.id;
  const players = selectedTeamId
    ? await prisma.player.findMany({
        where: { teamId: selectedTeamId },
        orderBy: [{ jerseyNumber: "asc" }, { lastName: "asc" }],
      })
    : [];

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
              <div key={season.id} className="flex items-center justify-between gap-3 p-3">
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
                {!season.isActive ? (
                  <ActionForm action={activateSeasonAction} resetOnSuccess={false}>
                    <input type="hidden" name="seasonId" value={season.id} />
                    <SubmitButton variant="ghost">Make active</SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New season</h3>
            <ActionForm action={createSeasonAction} className="grid gap-3 sm:grid-cols-2">
              {(state) => (
                <>
                  <Field label="Name" htmlFor="season-name">
                    <input id="season-name" name="name" className={inputClass} required />
                    <FieldError state={state} name="name" />
                  </Field>
                  <Field label="Slug" htmlFor="season-slug" hint="Blank = derived from the name.">
                    <input id="season-slug" name="slug" className={inputClass} />
                    <FieldError state={state} name="slug" />
                  </Field>
                  <Field label="Starts" htmlFor="season-start">
                    <input
                      id="season-start"
                      name="startsOn"
                      type="date"
                      className={inputClass}
                      required
                    />
                    <FieldError state={state} name="startsOn" />
                  </Field>
                  <Field label="Ends" htmlFor="season-end">
                    <input
                      id="season-end"
                      name="endsOn"
                      type="date"
                      className={inputClass}
                      required
                    />
                    <FieldError state={state} name="endsOn" />
                  </Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" name="isActive" className="h-4 w-4" />
                    Make this the active season
                  </label>
                  <div className="sm:col-span-2">
                    <SubmitButton>Create season</SubmitButton>
                  </div>
                </>
              )}
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
              {(state) => (
                <>
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
                    <FieldError state={state} name="name" />
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
                </>
              )}
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
            {teams.map((team) => (
              <a
                key={team.id}
                href={`/admin/league?team=${team.id}`}
                className="hover:bg-surface-muted flex items-center justify-between p-3 text-sm"
              >
                <span>
                  {team.crestEmoji} {team.name}
                  <span className="text-muted block text-xs">{team.division.name}</span>
                </span>
                <span className="text-muted text-xs">{team._count.players} player(s)</span>
              </a>
            ))}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">New team</h3>
            <ActionForm action={createTeamAction} className="grid gap-3 sm:grid-cols-2">
              {(state) => (
                <>
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
                    <FieldError state={state} name="name" />
                  </Field>
                  <Field label="Short name" htmlFor="team-short">
                    <input id="team-short" name="shortName" maxLength={24} className={inputClass} />
                    <FieldError state={state} name="shortName" />
                  </Field>
                  <Field label="Crest emoji" htmlFor="team-crest">
                    <input
                      id="team-crest"
                      name="crestEmoji"
                      maxLength={4}
                      defaultValue={"\u26BD"}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Captain" htmlFor="team-captain">
                    <input id="team-captain" name="captainName" className={inputClass} />
                  </Field>
                  <Field label="Contact e-mail" htmlFor="team-email">
                    <input
                      id="team-email"
                      name="contactEmail"
                      type="email"
                      className={inputClass}
                    />
                    <FieldError state={state} name="contactEmail" />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton>Create team</SubmitButton>
                  </div>
                </>
              )}
            </ActionForm>
          </Card>
        </div>
      </section>

      {/* -------------------------------- Players --------------------------- */}
      <section aria-labelledby="players">
        <h2 id="players" className="mb-3 text-lg font-semibold">
          Roster: {teams.find((t) => t.id === selectedTeamId)?.name ?? "pick a team above"}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle max-h-96 divide-y overflow-y-auto">
            {players.length === 0 ? (
              <p className="text-muted p-4 text-sm">No players registered.</p>
            ) : (
              players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-2 p-3 text-sm"
                >
                  <span className={player.active ? "" : "text-muted line-through"}>
                    {player.jerseyNumber !== null ? `#${player.jerseyNumber} ` : ""}
                    {player.firstName} {player.lastName}
                    {player.position ? (
                      <span className="text-muted text-xs"> &middot; {player.position}</span>
                    ) : null}
                  </span>
                  <ActionForm action={togglePlayerAction} resetOnSuccess={false}>
                    <input type="hidden" name="playerId" value={player.id} />
                    <SubmitButton variant="ghost">
                      {player.active ? "Deactivate" : "Reactivate"}
                    </SubmitButton>
                  </ActionForm>
                </div>
              ))
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Add a player</h3>
            <ActionForm action={createPlayerAction} className="grid gap-3 sm:grid-cols-2">
              {(state) => (
                <>
                  <Field label="Team" htmlFor="player-team">
                    <select
                      id="player-team"
                      name="teamId"
                      defaultValue={selectedTeamId ?? ""}
                      className={inputClass}
                      required
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Shirt number" htmlFor="player-number">
                    <input
                      id="player-number"
                      name="jerseyNumber"
                      type="number"
                      min={0}
                      max={99}
                      className={inputClass}
                    />
                    <FieldError state={state} name="jerseyNumber" />
                  </Field>
                  <Field label="First name" htmlFor="player-first">
                    <input id="player-first" name="firstName" className={inputClass} required />
                    <FieldError state={state} name="firstName" />
                  </Field>
                  <Field label="Last name" htmlFor="player-last">
                    <input id="player-last" name="lastName" className={inputClass} required />
                    <FieldError state={state} name="lastName" />
                  </Field>
                  <Field label="Position" htmlFor="player-position">
                    <input id="player-position" name="position" className={inputClass} />
                  </Field>
                  <Field label="E-mail" htmlFor="player-email">
                    <input id="player-email" name="email" type="email" className={inputClass} />
                    <FieldError state={state} name="email" />
                  </Field>
                  <div className="sm:col-span-2">
                    <SubmitButton>Add player</SubmitButton>
                  </div>
                </>
              )}
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
              {(state) => (
                <>
                  <Field label="Name" htmlFor="venue-name">
                    <input id="venue-name" name="name" className={inputClass} required />
                    <FieldError state={state} name="name" />
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
                </>
              )}
            </ActionForm>
          </Card>
        </div>
      </section>
    </div>
  );
}
