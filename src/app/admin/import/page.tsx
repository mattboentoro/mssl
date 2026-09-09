import { ScheduleImportForm } from "@/components/schedule-import-form";
import { Card } from "@/components/ui";
import { getSeasons } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule import" };

export default async function AdminImportPage() {
  const seasons = await getSeasons();

  return (
    <div className="space-y-6">
      <Card className="p-5 text-sm">
        <h2 className="mb-2 font-semibold">How the import works</h2>
        <ol className="text-muted list-decimal space-y-1 pl-5">
          <li>
            Paste a CSV with a header row, then press <strong>Dry run</strong>.
          </li>
          <li>
            Every row is validated: teams and divisions must already exist in the chosen season and
            both teams must belong to the named division.
          </li>
          <li>
            Rows matching an existing fixture (same matchweek and same two teams) are flagged as
            duplicates and skipped.
          </li>
          <li>
            Press <strong>Import valid rows</strong> to commit. Errored and duplicate rows are never
            written, and the import is recorded in the audit log.
          </li>
        </ol>
      </Card>

      <ScheduleImportForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
