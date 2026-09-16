"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { importScheduleAction, type CsvImportState } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin-forms";
import { useDialogClose } from "@/components/form-dialog";
import { Alert, Card, Field, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";

const SAMPLE = `matchweek,kickoff,division,home,away,venue,counts
1,2026-03-07 18:00,Premier Division,Redmond Rangers,Bellevue Bytes,Marymoor Field 3,yes
Final,2026-06-13 18:00,Premier Division,Redmond Rangers,Bellevue Bytes,Marymoor Field 1,no`;

export function ScheduleImportForm({ seasons }: { seasons: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<CsvImportState, FormData>(importScheduleAction, {});
  const [seasonId, setSeasonId] = useState(state.seasonId ?? seasons[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const csvRef = useRef<HTMLTextAreaElement>(null);
  const closeDialog = useDialogClose();

  // A dry run has to stay on screen so the preview can be read, but a
  // committed import is done — get out of the way and let the fixture list
  // behind the dialog show the result.
  const committed = state.committed === true;
  useEffect(() => {
    if (committed) closeDialog();
  }, [committed, closeDialog]);

  // The file is read in the browser and dropped into the textarea, so the
  // server action keeps its single `csv` string input and the pasted and
  // uploaded paths validate through exactly the same code.
  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (csvRef.current) csvRef.current.value = String(reader.result ?? "");
      setFileName(file.name);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}

        <Field label="Season" htmlFor="import-season">
          <select
            id="import-season"
            name="seasonId"
            value={seasonId}
            onChange={(event) => setSeasonId(event.target.value)}
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

        <Field label="Upload a CSV file" htmlFor="import-file">
          <input
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className={`${inputClass} file:border-0 file:bg-transparent file:text-sm`}
          />
          <p className="text-muted mt-1 text-xs">
            {fileName
              ? `Loaded ${fileName}. Review it below, then dry run.`
              : "Optional \u2014 the file is loaded into the box below, where you can still edit it."}
          </p>
        </Field>

        <Field
          label="CSV"
          htmlFor="import-csv"
          hint="Columns: matchweek, kickoff, division, home, away, venue, counts. Matchweek is free text, so 7 and Final both work. Kick-off is read as Redmond time; YYYY-MM-DD HH:mm and M/D/YYYY HH:mm both work. Divisions and teams that are not on file yet are created for you. Venue is free text and is stored exactly as typed. Counts is optional — put no for a final or friendly that must stay out of the league table."
        >
          <textarea
            id="import-csv"
            name="csv"
            ref={csvRef}
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

      {(state.newDivisions && state.newDivisions.length > 0) ||
      (state.newTeams && state.newTeams.length > 0) ? (
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold">Will be added to the league</h3>
          <p className="text-muted mb-3 text-xs">
            These names are not on file yet. Importing creates them, with a kit colour chosen to
            avoid a clash inside their division. You can edit them afterwards in League setup.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {state.newDivisions && state.newDivisions.length > 0 ? (
              <div>
                <p className="text-muted text-xs font-semibold uppercase">
                  New divisions ({state.newDivisions.length})
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {state.newDivisions.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {state.newTeams && state.newTeams.length > 0 ? (
              <div>
                <p className="text-muted text-xs font-semibold uppercase">
                  New teams ({state.newTeams.length})
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {state.newTeams.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

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
                    {row.resolved ? formatDateTime(row.resolved.kickoffAt) : row.raw.kickoff}
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
                    {row.notes && row.notes.length > 0 ? (
                      <ul className="text-muted mt-1 space-y-0.5 text-xs">
                        {row.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
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
