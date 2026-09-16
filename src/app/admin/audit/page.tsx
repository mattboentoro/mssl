import Link from "next/link";

import { Badge, ButtonLink, Card, EmptyState, inputClass } from "@/components/ui";
import { parseAuditMetadata } from "@/lib/audit";
import { formatDateTime, relativeTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

function summarise(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
    )
    .join(" \u00B7 ");
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entity?: string; actor?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: {
    action?: { contains: string };
    entity?: string;
    actorEmail?: { contains: string };
  } = {};
  if (params.action) where.action = { contains: params.action };
  if (params.entity) where.entity = params.entity;
  if (params.actor) where.actorEmail = { contains: params.actor };

  const [entries, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const queryFor = (nextPage: number) => {
    const search = new URLSearchParams();
    if (params.action) search.set("action", params.action);
    if (params.entity) search.set("entity", params.entity);
    if (params.actor) search.set("actor", params.actor);
    if (nextPage > 1) search.set("page", String(nextPage));
    const qs = search.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-4" method="get">
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Action</span>
            <input
              name="action"
              defaultValue={params.action ?? ""}
              placeholder="match.assign"
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">Entity</span>
            <select name="entity" defaultValue={params.entity ?? ""} className={inputClass}>
              <option value="">All</option>
              {entities.map((row) => (
                <option key={row.entity} value={row.entity}>
                  {row.entity}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted mb-1 block text-xs font-medium uppercase">
              Actor e-mail
            </span>
            <input
              name="actor"
              defaultValue={params.actor ?? ""}
              placeholder="riley"
              className={inputClass}
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary">
              Filter
            </button>
            <Link href="/admin/audit" className="text-muted self-center text-sm underline">
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {entries.length === 0 ? (
        <EmptyState title="No audit entries" hint="Nothing matches those filters yet." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="data-table w-full min-w-[52rem] text-sm">
            <caption className="sr-only">Audit log entries</caption>
            <thead className="text-muted text-xs uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">
                  When
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Actor
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Action
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Entity
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span title={formatDateTime(entry.createdAt)}>
                      {relativeTime(entry.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="block">{entry.actorEmail ?? "system"}</span>
                    {entry.actorRole ? (
                      <span className="text-muted text-xs">{entry.actorRole}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone="neutral">{entry.action}</Badge>
                  </td>
                  <td className="text-muted px-3 py-2 font-mono text-xs">
                    {entry.entity}
                    {entry.entityId ? (
                      <span className="block opacity-70">{entry.entityId.slice(0, 12)}</span>
                    ) : null}
                  </td>
                  <td className="text-muted px-3 py-2 text-xs break-words">
                    {summarise(parseAuditMetadata(entry.metadata))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <nav className="flex items-center justify-between" aria-label="Audit log pagination">
        <p className="text-muted text-sm">
          Page {page} of {pageCount} &middot; {total} entr{total === 1 ? "y" : "ies"}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <ButtonLink href={queryFor(page - 1)} variant="secondary">
              Previous
            </ButtonLink>
          ) : null}
          {page < pageCount ? (
            <ButtonLink href={queryFor(page + 1)} variant="secondary">
              Next
            </ButtonLink>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
