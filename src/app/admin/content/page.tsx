import { createAnnouncementAction, createDocumentAction } from "@/app/admin/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { Card, Field, inputClass } from "@/components/ui";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getSeasons } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Announcements & documents" };

export default async function AdminContentPage() {
  const [announcements, documents, seasons] = await Promise.all([
    prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 25 }),
    prisma.document.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    getSeasons(),
  ]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="announcements">
        <h2 id="announcements" className="mb-3 text-lg font-semibold">
          Announcements
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle max-h-[28rem] divide-y overflow-y-auto">
            {announcements.length === 0 ? (
              <p className="text-muted p-4 text-sm">Nothing published yet.</p>
            ) : (
              announcements.map((item) => (
                <article key={item.id} className="p-4">
                  <p className="text-sm font-semibold">
                    {item.pinned ? <span className="text-accent mr-1">📌</span> : null}
                    {item.title}
                  </p>
                  <p className="text-muted text-xs">
                    {item.publishedAt ? formatDate(item.publishedAt) : "Draft"}
                  </p>
                  <p className="text-muted mt-1 text-sm">{item.summary}</p>
                </article>
              ))
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Publish an announcement</h3>
            <ActionForm action={createAnnouncementAction} className="space-y-3">
              <Field label="Title" htmlFor="ann-title">
                <input id="ann-title" name="title" className={inputClass} required />
                <FieldError name="title" />
              </Field>
              <Field label="Summary" htmlFor="ann-summary">
                <input id="ann-summary" name="summary" className={inputClass} required />
                <FieldError name="summary" />
              </Field>
              <Field
                label="Body"
                htmlFor="ann-body"
                hint="Plain text; blank lines separate paragraphs."
              >
                <textarea id="ann-body" name="body" rows={6} className={inputClass} required />
                <FieldError name="body" />
              </Field>
              <Field
                label="Season"
                htmlFor="ann-season"
                hint="Optional — leave blank for league-wide news."
              >
                <select id="ann-season" name="seasonId" defaultValue="" className={inputClass}>
                  <option value="">League-wide</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pinned" className="h-4 w-4" />
                Pin to the home page
              </label>
              <SubmitButton>Publish</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </section>

      <section aria-labelledby="documents">
        <h2 id="documents" className="mb-3 text-lg font-semibold">
          Documents &amp; downloads
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="divide-subtle max-h-[28rem] divide-y overflow-y-auto">
            {documents.length === 0 ? (
              <p className="text-muted p-4 text-sm">No documents yet.</p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="p-4 text-sm">
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-muted text-xs">
                    {DOCUMENT_CATEGORY_LABELS[
                      doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                    ] ?? doc.category}
                    {doc.fileType ? ` \u00B7 ${doc.fileType}` : ""}
                  </p>
                  {doc.description ? <p className="text-muted mt-1">{doc.description}</p> : null}
                </div>
              ))
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Add a document</h3>
            <ActionForm action={createDocumentAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="doc-title">
                <input id="doc-title" name="title" className={inputClass} required />
                <FieldError name="title" />
              </Field>
              <Field label="Category" htmlFor="doc-category">
                <select id="doc-category" name="category" className={inputClass}>
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {DOCUMENT_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="URL" htmlFor="doc-url">
                <input id="doc-url" name="url" className={inputClass} required />
                <FieldError name="url" />
              </Field>
              <Field label="File type" htmlFor="doc-filetype">
                <input id="doc-filetype" name="fileType" placeholder="PDF" className={inputClass} />
              </Field>
              <Field label="Description" htmlFor="doc-description">
                <input id="doc-description" name="description" className={inputClass} />
              </Field>
              <Field label="Sort order" htmlFor="doc-sort">
                <input
                  id="doc-sort"
                  name="sortOrder"
                  type="number"
                  min={0}
                  defaultValue={documents.length}
                  className={inputClass}
                />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>Add document</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
      </section>
    </div>
  );
}
