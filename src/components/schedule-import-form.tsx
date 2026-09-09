"use client";

import { useActionState } from "react";

import { importScheduleAction, type CsvImportState } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin-forms";
import { Alert, Card, Field, inputClass } from "@/components/ui";

const SAMPLE = `matchweek,kickoff,division,home,away,venue
1,2026-03-07T18:00:00Z,Premier Division,Redmond Rangers,Bellevue Bytes,Redmond Campus Pitch 1`;

export function ScheduleImportForm({ seasons }: { seasons: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<CsvImportState, FormData>(importScheduleAction, {});

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form action={formAction} className="space-y-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}

          <Field label="Season" htmlFor="import-season">
            <select
              id="import-season"
              name="seasonId"
              defaultValue={state.seasonId ?? seasons[0]?.id ?? ""}
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

          <Field
            label="CSV"
            htmlFor="import-csv"
            hint="Columns: matchweek, kickoff (ISO 8601), division, home, away, venue (optional). Teams and divisions are matched by name, slug or short name."
          >
            <textarea
              id="import-csv"
              name="csv"
              rows={10}
              defaultValue={state.csv ?? SAMPLE}
              className={`${inputClass} font-mono text-xs`}
              required
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <SubmitButton name="mode" value="dry-run" variant="secondary">
              Dry run
            </SubmitButton>
            <SubmitButton
              name="mode"
              value="commit"
              confirm="Import every valid row into the schedule?"
            >
              Import valid rows
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.rows && state.rows.length > 0 ? (
        <Card className="overflow-x-auto">
          <div className="border-subtle flex flex-wrap gap-4 border-b p-4 text-sm">
            <span>
              <strong className="text-success">{state.validCount}</strong> importable
            </span>
            <span>
              <strong className="text-warning">{state.duplicateCount}</strong> duplicate
            </span>
            <span>
              <strong className="text-danger">{state.errorCount}</strong> error
            </span>
          </div>
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-surface-muted text-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Line</th>
                <th className="px-3 py-2 text-left">Fixture</th>
                <th className="px-3 py-2 text-left">Division</th>
                <th className="px-3 py-2 text-left">Kick-off</th>
                <th className="px-3 py-2 text-left">Venue</th>
                <th className="px-3 py-2 text-left">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-subtle divide-y">
              {state.rows.map((row) => (
                <tr key={row.line}>
                  <td className="text-muted px-3 py-2 font-mono text-xs">{row.line}</td>
                  <td className="px-3 py-2">
                    {row.resolved
                      ? `${row.resolved.homeTeamName} v ${row.resolved.awayTeamName}`
                      : `${row.raw.home ?? "?"} v ${row.raw.away ?? "?"}`}
                  </td>
                  <td className="text-muted px-3 py-2">
                    {row.resolved?.divisionName ?? row.raw.division}
                  </td>
                  <td className="text-muted px-3 py-2 font-mono text-xs">
                    {row.resolved?.kickoffAt ?? row.raw.kickoff}
                  </td>
                  <td className="text-muted px-3 py-2">
                    {row.resolved?.venueName ?? row.raw.venue ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2">
                    {row.error ? (
                      <span className="text-danger">{row.error}</span>
                    ) : row.resolved?.duplicate ? (
                      <span className="text-warning">Already scheduled &mdash; skipped</span>
                    ) : (
                      <span className="text-success">Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
