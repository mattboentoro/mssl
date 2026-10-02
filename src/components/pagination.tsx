import Link from "next/link";

import { outlineButtonClass } from "@/components/ui";
import { pageHref, type pagination, type SearchParams } from "@/lib/pagination";

export function Pagination({
  basePath,
  params,
  range,
  label,
}: {
  basePath: string;
  params: SearchParams;
  range: ReturnType<typeof pagination>;
  label: string;
}) {
  return (
    <nav
      aria-label={`${label} pagination`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-muted text-sm">
        Showing {range.start}&ndash;{range.end} of {range.total} {label.toLowerCase()} &middot; Page{" "}
        {range.page} of {range.pages}
      </p>
      <div className="flex items-center gap-2">
        {range.page > 1 ? (
          <Link
            className={outlineButtonClass}
            href={pageHref(basePath, params, range.page - 1)}
            rel="prev"
          >
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted px-3 py-1.5 text-sm">
            Previous
          </span>
        )}
        {range.page < range.pages ? (
          <Link
            className={outlineButtonClass}
            href={pageHref(basePath, params, range.page + 1)}
            rel="next"
          >
            Next
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted px-3 py-1.5 text-sm">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
