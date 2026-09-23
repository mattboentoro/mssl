import Link from "next/link";

import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { CloseOnSuccess, Dialog, DialogCancel } from "@/components/form-dialog";
import { StandingsTable } from "@/components/match-display";
import { PointsTeamPicker } from "@/components/points-team-picker";
import { SeasonTabs } from "@/components/season-tabs";
import { Alert, Card, EmptyState, Field, inputClass, outlineButtonClass } from "@/components/ui";
import { createPointsAdjustmentAction, deletePointsAdjustmentAction } from "@/app/admin/actions";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  getPointsAdjustments,
  getSeasons,
  getStandingsForSeason,
  resolveSeason,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Standings" };

/**
 * The only sanctioned way to alter a league table. Results themselves stay
 * derived from game reports; a sanction is recorded as a separate signed
 * adjustment so the arithmetic on the public table always reconciles.
 */
export default async function AdminStandingsPage({
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
          hint="Create a season in League setup before adjusting a table."
        />
      </Card>
    );
  }

  const [divisions, adjustments, allTeams, seasonDivisions] = await Promise.all([
    getStandingsForSeason(season.id),
    getPointsAdjustments(season.id),
    prisma.team.findMany({
      orderBy: [{ division: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, divisionId: true },
    }),
    prisma.division.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  // Every team in the league goes to the browser so the league filter can
  // narrow the picker without a round-trip.
  const pickerTeams = allTeams.map((team) => ({
    id: team.id,
    name: team.name,
    divisionId: team.divisionId,
  }));

  return (
    <div className="space-y-8">
      <SeasonTabs seasons={seasons} currentSeasonId={season.id} basePath="/admin/standings" />

      <section aria-labelledby="adjust-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="adjust-list" className="text-lg font-semibold">
            Active adjustments
          </h2>
          <Dialog
            trigger="Add adjustment"
            triggerClassName={outlineButtonClass}
            title="Adjust a team's points"
            description="Use a negative number to deduct points and a positive number to restore them. Results are never edited here — the adjustment is stored separately and shown on the public table, so the maths always adds up."
          >
            {pickerTeams.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">No teams in this season yet.</p>
                <p className="text-muted text-sm">
                  There is nothing to adjust here. Add teams in{" "}
                  <Link href="/admin/league" className="underline underline-offset-2">
                    Seasons &amp; teams
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <ActionForm
                action={createPointsAdjustmentAction}
                className="space-y-4"
                showSuccess={false}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="seasonId" value={season.id} />
                  <PointsTeamPicker divisions={seasonDivisions} teams={pickerTeams} />

                  <Field
                    label="Points"
                    htmlFor="adj-points"
                    hint="Negative deducts, e.g. &minus;3. Zero is not allowed."
                  >
                    <input
                      id="adj-points"
                      name="points"
                      type="number"
                      min={-50}
                      max={50}
                      step={1}
                      defaultValue={-3}
                      className={inputClass}
                      required
                    />
                    <FieldError name="points" />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field
                      label="Reason"
                      htmlFor="adj-reason"
                      hint="Shown to the public alongside the adjustment."
                    >
                      <input
                        id="adj-reason"
                        name="reason"
                        className={inputClass}
                        placeholder="Fielding an ineligible player in matchweek 4"
                        required
                      />
                      <FieldError name="reason" />
                    </Field>
                  </div>
                </div>

                <div className="border-subtle flex items-center justify-end gap-2 border-t pt-4">
                  <DialogCancel />
                  <SubmitButton>Apply adjustment</SubmitButton>
                </div>
                <CloseOnSuccess />
              </ActionForm>
            )}
          </Dialog>
        </div>

        {adjustments.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              title="No adjustments in this season"
              hint="Every table below is exactly as the game reports left it."
            />
          </Card>
        ) : (
          <Card className="divide-subtle divide-y">
            {adjustments.map((adjustment) => (
              <div key={adjustment.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span
                  className={
                    adjustment.points < 0
                      ? "text-danger w-12 shrink-0 text-right font-bold tabular-nums"
                      : "w-12 shrink-0 text-right font-bold text-emerald-600 tabular-nums"
                  }
                >
                  {adjustment.points > 0 ? "+" : "\u2212"}
                  {Math.abs(adjustment.points)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {adjustment.team.name}
                    <span className="text-muted font-normal">
                      {" "}
                      &middot; {adjustment.team.division.name}
                    </span>
                  </p>
                  <p className="text-muted text-xs">
                    {adjustment.reason}
                    {adjustment.createdByName ? ` \u00b7 ${adjustment.createdByName}` : ""}
                  </p>
                </div>
                <time className="text-muted shrink-0 text-xs">
                  {formatDate(adjustment.createdAt)}
                </time>
                <ActionForm action={deletePointsAdjustmentAction} resetOnSuccess={false}>
                  <input type="hidden" name="adjustmentId" value={adjustment.id} />
                  <SubmitButton variant="ghost">Reverse</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="adjust-tables">
        <h2 id="adjust-tables" className="mb-3 text-lg font-semibold">
          Standings (as they stands)
        </h2>
        <Alert tone="info" title="These are the live public tables">
          Adjustments are already applied below, exactly as visitors see them at{" "}
          <Link href="/standings" className="underline">
            /standings
          </Link>
          .
        </Alert>
        <div className="mt-4 space-y-8">
          {divisions.map((division) => (
            <div key={division.divisionId}>
              <h3 className="mb-2 text-base font-semibold">{division.divisionName}</h3>
              {division.rows.length === 0 ? (
                <Card className="p-6">
                  <EmptyState title="No teams in this division yet" />
                </Card>
              ) : (
                <StandingsTable
                  rows={division.rows}
                  primaryMetric={division.primaryMetric}
                  caption={`${division.divisionName} table for ${season.name}`}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
