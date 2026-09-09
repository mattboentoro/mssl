"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { postJson } from "@/components/match-actions";
import { Alert, Button, Field, inputClass, labelClass } from "@/components/ui";
import { CARD_LABELS, type CardType } from "@/lib/enums";

export interface ReportTeam {
  id: string;
  name: string;
}

interface CardDraft {
  key: string;
  type: CardType;
  teamId: string;
  playerName: string;
  minute: string;
  note: string;
}

const newKey = () => Math.random().toString(36).slice(2, 10);

/**
 * The referee's match report: the final score, any cards, and free-text notes.
 *
 * The league does not maintain squad lists, so a carded player is identified by
 * whatever name the referee wrote on the card. Goalscorers are not recorded.
 */
export function GameReportForm({
  matchId,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  homeTeam: ReportTeam;
  awayTeam: ReportTeam;
}) {
  const router = useRouter();

  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [homeForfeit, setHomeForfeit] = useState(false);
  const [awayForfeit, setAwayForfeit] = useState(false);
  const [notes, setNotes] = useState("");
  const [incidentReport, setIncidentReport] = useState("");
  const [misconduct, setMisconduct] = useState("");
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const teams = useMemo(() => [homeTeam, awayTeam], [homeTeam, awayTeam]);
  const doubleForfeitMismatch =
    homeForfeit && awayForfeit && (Number(homeScore) !== 0 || Number(awayScore) !== 0);
  const incompleteCard = cards.some((card) => card.playerName.trim().length < 2);

  function addCard(type: CardType) {
    setCards((current) => [
      ...current,
      { key: newKey(), type, teamId: homeTeam.id, playerName: "", minute: "", note: "" },
    ]);
  }

  function updateCard(key: string, patch: Partial<CardDraft>) {
    setCards((current) => current.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  }

  function removeCard(key: string) {
    setCards((current) => current.filter((card) => card.key !== key));
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await postJson(`/api/matches/${matchId}/report`, {
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      homeForfeit,
      awayForfeit,
      notes: notes || null,
      incidentReport: incidentReport || null,
      misconduct: misconduct || null,
      cards: cards.map((card) => ({
        type: card.type,
        teamId: card.teamId,
        playerName: card.playerName.trim(),
        minute: card.minute === "" ? null : Number(card.minute),
        note: card.note || null,
      })),
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Could not submit the report.");
      setFieldErrors(result.fields ?? {});
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <Alert title="The report was not accepted">
          <p>{error}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-2 list-inside list-disc">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <span className="font-mono text-xs">{field}</span>: {message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Final score</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label={homeTeam.name} htmlFor="homeScore">
            <input
              id="homeScore"
              name="homeScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              required
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              className={`${inputClass} text-center text-2xl font-bold`}
            />
          </Field>
          <Field label={awayTeam.name} htmlFor="awayScore">
            <input
              id="awayScore"
              name="awayScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              required
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              className={`${inputClass} text-center text-2xl font-bold`}
            />
          </Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="border-subtle flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={homeForfeit}
              onChange={(e) => setHomeForfeit(e.target.checked)}
              className="h-4 w-4"
            />
            {homeTeam.name} forfeited
          </label>
          <label className="border-subtle flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={awayForfeit}
              onChange={(e) => setAwayForfeit(e.target.checked)}
              className="h-4 w-4"
            />
            {awayTeam.name} forfeited
          </label>
        </div>

        {doubleForfeitMismatch ? (
          <Alert tone="warning" title="A double forfeit must be entered as 0-0">
            Neither side fielded a team, so set both scores to zero. The standings apply the
            league&rsquo;s forfeit rules from there.
          </Alert>
        ) : homeForfeit || awayForfeit ? (
          <Alert tone="warning" title="Forfeit recorded">
            The standings will apply the league&rsquo;s default forfeit scoreline rather than the
            score you enter here.
          </Alert>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Disciplinary action</legend>
        <p className="text-muted text-sm">
          Add a row for each card you showed. Type the player&rsquo;s name as it was given to you
          &mdash; the league does not keep squad lists.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["YELLOW", "RED"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant="secondary"
              onClick={() => addCard(type)}
              className="px-3 py-1.5 text-xs"
            >
              + {CARD_LABELS[type]}
            </Button>
          ))}
        </div>

        {cards.length === 0 ? (
          <p className="text-muted text-sm">No cards shown.</p>
        ) : (
          <ul className="space-y-3">
            {cards.map((card, index) => (
              <li key={card.key} className="border-subtle rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted text-xs font-semibold uppercase">
                    {CARD_LABELS[card.type]} #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCard(card.key)}
                    className="text-danger text-xs hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelClass} htmlFor={`${card.key}-team`}>
                      Team
                    </label>
                    <select
                      id={`${card.key}-team`}
                      value={card.teamId}
                      onChange={(e) => updateCard(card.key, { teamId: e.target.value })}
                      className={inputClass}
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass} htmlFor={`${card.key}-player`}>
                      Player name
                    </label>
                    <input
                      id={`${card.key}-player`}
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="off"
                      placeholder="e.g. Jordan Reyes"
                      value={card.playerName}
                      onChange={(e) => updateCard(card.key, { playerName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`${card.key}-minute`}>
                      Minute (optional)
                    </label>
                    <input
                      id={`${card.key}-minute`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={130}
                      value={card.minute}
                      onChange={(e) => updateCard(card.key, { minute: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className={labelClass} htmlFor={`${card.key}-note`}>
                    Note (optional)
                  </label>
                  <input
                    id={`${card.key}-note`}
                    type="text"
                    maxLength={280}
                    value={card.note}
                    onChange={(e) => updateCard(card.key, { note: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Referee notes</legend>
        <Field label="Match notes" htmlFor="notes" hint="Shown to league admins only.">
          <textarea
            id="notes"
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Incident report"
          htmlFor="incidentReport"
          hint="Injuries, abandonment, crowd issues. Never shown publicly."
        >
          <textarea
            id="incidentReport"
            rows={3}
            maxLength={4000}
            value={incidentReport}
            onChange={(e) => setIncidentReport(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Misconduct"
          htmlFor="misconduct"
          hint="Detail behind any red card or reportable behaviour."
        >
          <textarea
            id="misconduct"
            rows={3}
            maxLength={4000}
            value={misconduct}
            onChange={(e) => setMisconduct(e.target.value)}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <div className="border-subtle flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          type="submit"
          disabled={submitting || doubleForfeitMismatch || incompleteCard}
          aria-busy={submitting}
        >
          {submitting ? "Submitting\u2026" : "Submit game report"}
        </Button>
        <p className="text-muted text-xs">
          Once submitted the report is read-only to you. Corrections go through a league admin.
        </p>
      </div>
    </form>
  );
}
