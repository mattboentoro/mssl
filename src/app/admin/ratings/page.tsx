import type { Metadata } from "next";
import Link from "next/link";

import { Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listRefereeRatingsForAdmin } from "@/lib/referee-ratings";

export const metadata: Metadata = { title: "Referee ratings" };
export const dynamic = "force-dynamic";

export default async function AdminRatingsPage() {
  const ratings = await listRefereeRatingsForAdmin(prisma);

  return (
    <section aria-labelledby="referee-ratings-heading">
      <div className="mb-5">
        <p className="text-muted text-xs font-semibold tracking-wide uppercase">Accountability</p>
        <h2 id="referee-ratings-heading" className="mt-1 text-2xl font-bold">
          Referee ratings
        </h2>
        <p className="text-muted mt-1 text-sm">
          Private team feedback. These identities and comments are visible only to administrators.
        </p>
      </div>
      {ratings.length === 0 ? (
        <EmptyState title="No referee ratings have been submitted" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Private referee ratings with submitting actor and team
            </caption>
            <thead className="bg-surface-muted text-muted text-xs uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Match
                </th>
                <th scope="col" className="px-4 py-3">
                  Referee
                </th>
                <th scope="col" className="px-4 py-3">
                  Team
                </th>
                <th scope="col" className="px-4 py-3">
                  Actor
                </th>
                <th scope="col" className="px-4 py-3">
                  Stars
                </th>
                <th scope="col" className="px-4 py-3">
                  Private comment
                </th>
              </tr>
            </thead>
            <tbody className="divide-subtle divide-y">
              {ratings.map((rating) => (
                <tr key={rating.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/matches/${rating.match.id}`} className="hover:underline">
                      {rating.match.homeTeam.name} v {rating.match.awayTeam.name}
                    </Link>
                    <p className="text-muted text-xs">{formatDateTime(rating.match.kickoffAt)}</p>
                  </td>
                  <td className="px-4 py-3">{rating.referee.name}</td>
                  <td className="px-4 py-3">{rating.team.name}</td>
                  <td className="px-4 py-3">
                    {rating.ratedBy.displayName}
                    <p className="text-muted text-xs">{rating.ratedBy.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{rating.rating} / 5</td>
                  <td className="max-w-md px-4 py-3 whitespace-pre-wrap">
                    {rating.comment ?? <span className="text-muted">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
