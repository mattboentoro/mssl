export const ADMIN_PAGE_SIZE = 100;

export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function pagination(rawPage: string | string[] | undefined, total: number) {
  const value = firstParam(rawPage);
  const requested = value && /^\d+$/.test(value) ? Number(value) : 1;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, requested));
  const skip = (page - 1) * ADMIN_PAGE_SIZE;
  return {
    page,
    pages,
    skip,
    take: ADMIN_PAGE_SIZE,
    total,
    start: total === 0 ? 0 : skip + 1,
    end: Math.min(skip + ADMIN_PAGE_SIZE, total),
  };
}

export function pageHref(basePath: string, params: SearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
  }
  query.set("page", String(page));
  return `${basePath}?${query}`;
}
