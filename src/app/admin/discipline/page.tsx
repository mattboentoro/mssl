import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { Badge, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { createDisciplinaryAction, deleteDisciplinaryActionAction } from "@/app/admin/actions";
import { CARD_LABELS, DISCIPLINARY_SOURCE_LABELS, type CardType } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getActiveSeason, getDisciplinaryRecords } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discipline" };

export default async function AdminDisciplinePage() {
  const season = await getActiveSeason();

  if (!season) {
    return (
      <Card className="p-6">
        <EmptyState
          title="No active season"
          hint="Create and activate a season in League setup before recording sanctions."
        />
      </Card>
    );
  }

  const [records, teams, matches] = await Promise.all([
    getDisciplinaryRecords(season.id),
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

  const yellow = records.filter((r) => r.type === "YELLOW").length;
  const red = records.filter((r) => r.type === "RED").length;

  return (
    <div className="space-y-8">
      <section aria-labelledby="discipline-add">
        <h2 id="discipline-add" className="mb-1 text-lg font-semibold">
          Record a disciplinary action
        </h2>
        <p className="text-muted mb-3 text-sm">
          Referees log cards on their game report. Use this form for league sanctions issued outside
          a fixture, or to correct an omission. Player names are free text.
        </p>
        <Card className="p-5">
          <ActionForm action={createDisciplinaryAction} className="grid gap-3 sm:grid-cols-2">
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

            <div className="sm:col-span-2">
              <SubmitButton>Record card</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </section>

      <section aria-labelledby="discipline-list">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="discipline-list" className="text-lg font-semibold">
            {season.name} disciplinary register
          </h2>
          <p className="text-muted text-sm">
            {yellow} yellow &middot; {red} red &middot; {records.length} total
          </p>
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
            {records.map((record) => (
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
                    {record.matchLabel ? ` \u00b7 ${record.matchLabel}` : " \u00b7 league sanction"}
                    {record.note ? ` \u00b7 ${record.note}` : ""}
                  </p>
                </div>
                <Badge tone={record.issuedBy === "ADMIN" ? "warning" : "neutral"}>
                  {DISCIPLINARY_SOURCE_LABELS[
                    record.issuedBy as keyof typeof DISCIPLINARY_SOURCE_LABELS
                  ] ?? record.issuedBy}
                </Badge>
                <time className="text-muted shrink-0 text-xs">{formatDate(record.createdAt)}</time>
                <ActionForm action={deleteDisciplinaryActionAction} resetOnSuccess={false}>
                  <input type="hidden" name="id" value={record.id} />
                  <SubmitButton variant="ghost">Rescind</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
