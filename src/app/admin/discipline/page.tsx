import Link from "next/link";

import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { CloseOnSuccess, Dialog, DialogCancel } from "@/components/form-dialog";
import { Badge, Card, EmptyState, Field, inputClass, outlineButtonClass } from "@/components/ui";
import {
  createDisciplinaryAction,
  deleteDisciplinaryActionAction,
  setSuspensionAction,
} from "@/app/admin/actions";
import {
  CARD_LABELS,
  DISCIPLINARY_SOURCE_LABELS,
  SUSPENSION_REASON_LABELS,
  type CardType,
  type SuspensionReason,
} from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  getDisciplinaryRecords,
  getSeasonSuspensions,
  getSeasons,
  resolveSeason,
} from "@/lib/queries";
import { outstandingSuspensions } from "@/lib/suspensions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discipline" };

const gamesLabel = (games: number) => `${games} game${games === 1 ? "" : "s"}`;

export default async function AdminDisciplinePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { season: seasonParam } = await searchParams;
  const [seasons, season] = await Promise.all([getSeasons(), resolveSeason(seasonParam)]);

  if (!season) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No seasons yet"
          hint="Create a season in League setup before recording sanctions."
        />
      </Card>
    );
  }

  const [records, suspensions, teams, matches] = await Promise.all([
    getDisciplinaryRecords(season.id),
    getSeasonSuspensions(season.id),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { division: { select: { name: true } } },
    }),
    prisma.match.findMany({
      where: { seasonId: season.id },
      orderBy: [{ kickoffAt: "asc" }],
      take: 200,
      select: {
        id: true,
        matchweek: true,
        homeTeam: { select: { shortName: true } },
        awayTeam: { select: { shortName: true } },
      },
    }),
  ]);

  // A red card carries no automatic length, so it waits here until somebody
  // decides one. Yellows never queue: the third one bans the player by itself.
  const pending = records.filter(
    (record) => record.type === "RED" && record.gamesSuspended === null,
  );
  const active = outstandingSuspensions(suspensions);
  const banById = new Map(suspensions.map((ban) => [ban.id, ban]));

  return (
    <div className="space-y-8">
      {seasons.length > 1 ? (
        <nav aria-label="Season" className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/admin/discipline?season=${s.slug}`}
              aria-current={s.id === season.id ? "page" : undefined}
              className={
                s.id === season.id
                  ? "bg-brand text-brand-contrast rounded-full px-3 py-1.5 text-sm font-medium"
                  : "border-subtle hover:bg-surface-muted rounded-full border px-3 py-1.5 text-sm"
              }
            >
              {s.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {pending.length > 0 ? (
        <section aria-labelledby="discipline-review">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="discipline-review" className="text-lg font-semibold">
              Red cards awaiting review
            </h2>
            <Badge tone="danger">{pending.length} to review</Badge>
          </div>
          <p className="text-muted mb-3 text-sm">
            Set how many fixtures each player misses. Zero records that you looked at the card and
            decided it warrants no ban.
          </p>
          <Card className="divide-subtle divide-y">
            {pending.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span aria-hidden className="bg-danger h-6 w-4 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {record.playerName}
                    <span className="text-muted font-normal"> &middot; {record.teamName}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {record.minute === null ? "" : `${record.minute}\u2019 \u00b7 `}
                    {record.matchLabel ?? "League sanction"}
                    {record.note ? ` \u00b7 ${record.note}` : ""}
                  </p>
                </div>
                <ActionForm
                  action={setSuspensionAction}
                  resetOnSuccess={false}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="id" value={record.id} />
                  <label className="text-muted text-xs" htmlFor={`susp-${record.id}`}>
                    Games
                    <input
                      id={`susp-${record.id}`}
                      name="gamesSuspended"
                      type="number"
                      min={0}
                      max={50}
                      defaultValue={1}
                      className={`${inputClass} mt-1 w-20`}
                      required
                    />
                  </label>
                  <SubmitButton>Apply</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="discipline-suspensions">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="discipline-suspensions" className="text-lg font-semibold">
            Active suspensions
          </h2>
        </div>
        {active.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="Nobody is suspended"
              hint="A player is banned automatically on their third yellow of the season, or when a red card is reviewed above."
            />
          </Card>
        ) : (
          <Card className="divide-subtle divide-y">
            {active.map((ban) => (
              <div key={ban.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {ban.playerName}
                    <span className="text-muted font-normal"> &middot; {ban.teamName}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {SUSPENSION_REASON_LABELS[ban.reason] ?? ban.reason} &middot;{" "}
                    {gamesLabel(ban.games)}
                    {ban.served > 0 ? ` \u00b7 ${ban.served} served` : ""}
                    {ban.upcoming.length > 0
                      ? ` \u00b7 misses ${ban.upcoming.map((m) => m.label).join(", ")}`
                      : " \u00b7 no fixture scheduled yet"}
                  </p>
                </div>
                <Badge tone="danger">{gamesLabel(ban.remaining)} left</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="discipline-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="discipline-list" className="text-lg font-semibold">
            Disciplinary register
          </h2>
          <Dialog
            trigger="Record card"
            triggerClassName={outlineButtonClass}
            title={`Record a disciplinary action in ${season.name}`}
            description="Referees log cards on their game report. Use this form for league sanctions issued outside a fixture, or to correct an omission. Player names are free text."
          >
            <ActionForm
              action={createDisciplinaryAction}
              showSuccess={false}
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="seasonId" value={season.id} />

              <Field label="Team" htmlFor="disc-team">
                <select id="disc-team" name="teamId" className={inputClass} required>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} &mdash; {team.division.name}
                    </option>
                  ))}
                </select>
                <FieldError name="teamId" />
              </Field>

              <Field label="Player name" htmlFor="disc-player">
                <input id="disc-player" name="playerName" className={inputClass} required />
                <FieldError name="playerName" />
              </Field>

              <Field label="Card" htmlFor="disc-type">
                <select id="disc-type" name="type" className={inputClass} required>
                  <option value="YELLOW">Yellow card</option>
                  <option value="RED">Red card</option>
                </select>
                <FieldError name="type" />
              </Field>

              <Field label="Minute" htmlFor="disc-minute" hint="Optional.">
                <input
                  id="disc-minute"
                  name="minute"
                  type="number"
                  min={0}
                  max={130}
                  className={inputClass}
                />
                <FieldError name="minute" />
              </Field>

              <Field
                label="Games suspended"
                htmlFor="disc-games"
                hint="Leave blank to decide later. A red card left blank waits in the review queue."
              >
                <input
                  id="disc-games"
                  name="gamesSuspended"
                  type="number"
                  min={0}
                  max={50}
                  className={inputClass}
                />
                <FieldError name="gamesSuspended" />
              </Field>

              <Field
                label="Fixture"
                htmlFor="disc-match"
                hint="Optional &mdash; leave blank for a league sanction."
              >
                <select id="disc-match" name="matchId" defaultValue="" className={inputClass}>
                  <option value="">No fixture</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      MW{match.matchweek} {match.homeTeam.shortName} v {match.awayTeam.shortName}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Note" htmlFor="disc-note">
                <input id="disc-note" name="note" className={inputClass} />
                <FieldError name="note" />
              </Field>

              <div className="border-subtle flex justify-end gap-2 border-t pt-3 sm:col-span-2">
                <DialogCancel />
                <SubmitButton>Record card</SubmitButton>
              </div>
              <CloseOnSuccess />
            </ActionForm>
          </Dialog>
        </div>

        {records.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No cards recorded"
              hint="Cards appear here as referees file game reports."
            />
          </Card>
        ) : (
          <Card className="divide-subtle divide-y">
            {records.map((record) => {
              const ban = banById.get(record.id);
              return (
                <div key={record.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span
                    aria-hidden
                    className={
                      record.type === "RED"
                        ? "bg-danger h-6 w-4 shrink-0 rounded-sm"
                        : "h-6 w-4 shrink-0 rounded-sm bg-yellow-400"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {record.playerName}
                      <span className="text-muted font-normal"> &middot; {record.teamName}</span>
                    </p>
                    <p className="text-muted text-xs">
                      {CARD_LABELS[record.type as CardType] ?? record.type}
                      {record.minute === null ? "" : ` \u00b7 ${record.minute}\u2019`}
                      {record.matchLabel
                        ? ` \u00b7 ${record.matchLabel}`
                        : " \u00b7 league sanction"}
                      {record.note ? ` \u00b7 ${record.note}` : ""}
                    </p>
                  </div>
                  {record.gamesSuspended !== null && record.gamesSuspended > 0 ? (
                    <Badge tone="danger">
                      {gamesLabel(record.gamesSuspended)}
                      {record.suspensionReason
                        ? ` \u00b7 ${SUSPENSION_REASON_LABELS[record.suspensionReason as SuspensionReason] ?? record.suspensionReason}`
                        : ""}
                      {ban && ban.remaining === 0 ? " \u00b7 served" : ""}
                    </Badge>
                  ) : null}
                  {record.type === "RED" && record.gamesSuspended === null ? (
                    <Badge tone="warning">Awaiting review</Badge>
                  ) : null}
                  <Badge tone={record.issuedBy === "ADMIN" ? "warning" : "neutral"}>
                    {DISCIPLINARY_SOURCE_LABELS[
                      record.issuedBy as keyof typeof DISCIPLINARY_SOURCE_LABELS
                    ] ?? record.issuedBy}
                  </Badge>
                  <time className="text-muted shrink-0 text-xs">
                    {formatDate(record.createdAt)}
                  </time>
                  <ActionForm action={deleteDisciplinaryActionAction} resetOnSuccess={false}>
                    <input type="hidden" name="id" value={record.id} />
                    <SubmitButton variant="ghost">Rescind</SubmitButton>
                  </ActionForm>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
