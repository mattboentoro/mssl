import {
  createAnnouncementAction,
  createDocumentAction,
  deleteAnnouncementAction,
  deleteDocumentAction,
  updateAnnouncementAction,
  updateDocumentAction,
} from "@/app/admin/actions";
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
                  <details className="mt-3">
                    <summary className="text-accent cursor-pointer text-xs font-semibold">
                      Edit announcement
                    </summary>
                    <ActionForm
                      action={updateAnnouncementAction}
                      resetOnSuccess={false}
                      className="mt-3 space-y-3"
                    >
                      <input type="hidden" name="announcementId" value={item.id} />
                      <Field label="Title" htmlFor={`ann-${item.id}-title`}>
                        <input
                          id={`ann-${item.id}-title`}
                          name="title"
                          defaultValue={item.title}
                          className={inputClass}
                          required
                        />
                        <FieldError name="title" />
                      </Field>
                      <Field label="Slug" htmlFor={`ann-${item.id}-slug`}>
                        <input
                          id={`ann-${item.id}-slug`}
                          name="slug"
                          defaultValue={item.slug}
                          className={inputClass}
                          required
                        />
                        <FieldError name="slug" />
                      </Field>
                      <Field label="Summary" htmlFor={`ann-${item.id}-summary`}>
                        <input
                          id={`ann-${item.id}-summary`}
                          name="summary"
                          defaultValue={item.summary}
                          className={inputClass}
                          required
                        />
                        <FieldError name="summary" />
                      </Field>
                      <Field label="Body" htmlFor={`ann-${item.id}-body`}>
                        <textarea
                          id={`ann-${item.id}-body`}
                          name="body"
                          rows={5}
                          defaultValue={item.body}
                          className={inputClass}
                          required
                        />
                        <FieldError name="body" />
                      </Field>
                      <Field label="Season" htmlFor={`ann-${item.id}-season`}>
                        <select
                          id={`ann-${item.id}-season`}
                          name="seasonId"
                          defaultValue={item.seasonId ?? ""}
                          className={inputClass}
                        >
                          <option value="">League-wide</option>
                          {seasons.map((season) => (
                            <option key={season.id} value={season.id}>
                              {season.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="pinned"
                          defaultChecked={item.pinned}
                          className="h-4 w-4"
                        />
                        Pin to the home page
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton>Save changes</SubmitButton>
                      </div>
                    </ActionForm>
                    <ActionForm
                      action={deleteAnnouncementAction}
                      resetOnSuccess={false}
                      className="mt-2"
                    >
                      <input
                        id={`delete-ann-${item.id}`}
                        type="hidden"
                        name="announcementId"
                        value={item.id}
                      />
                      <SubmitButton
                        variant="danger"
                        confirm={`Delete “${item.title}”? This cannot be undone.`}
                      >
                        Delete announcement
                      </SubmitButton>
                    </ActionForm>
                  </details>
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
                  <details className="mt-3">
                    <summary className="text-accent cursor-pointer text-xs font-semibold">
                      Edit document
                    </summary>
                    <ActionForm
                      action={updateDocumentAction}
                      resetOnSuccess={false}
                      className="mt-3 grid gap-3"
                    >
                      <input type="hidden" name="documentId" value={doc.id} />
                      <Field label="Title" htmlFor={`doc-${doc.id}-title`}>
                        <input
                          id={`doc-${doc.id}-title`}
                          name="title"
                          defaultValue={doc.title}
                          className={inputClass}
                          required
                        />
                        <FieldError name="title" />
                      </Field>
                      <Field label="Category" htmlFor={`doc-${doc.id}-category`}>
                        <select
                          id={`doc-${doc.id}-category`}
                          name="category"
                          defaultValue={doc.category}
                          className={inputClass}
                        >
                          {DOCUMENT_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {DOCUMENT_CATEGORY_LABELS[category]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="URL" htmlFor={`doc-${doc.id}-url`}>
                        <input
                          id={`doc-${doc.id}-url`}
                          name="url"
                          defaultValue={doc.url}
                          className={inputClass}
                          required
                        />
                        <FieldError name="url" />
                      </Field>
                      <Field label="File type" htmlFor={`doc-${doc.id}-filetype`}>
                        <input
                          id={`doc-${doc.id}-filetype`}
                          name="fileType"
                          defaultValue={doc.fileType ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Description" htmlFor={`doc-${doc.id}-description`}>
                        <input
                          id={`doc-${doc.id}-description`}
                          name="description"
                          defaultValue={doc.description ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Sort order" htmlFor={`doc-${doc.id}-sort`}>
                        <input
                          id={`doc-${doc.id}-sort`}
                          name="sortOrder"
                          type="number"
                          min={0}
                          defaultValue={doc.sortOrder}
                          className={inputClass}
                        />
                      </Field>
                      <SubmitButton>Save changes</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={deleteDocumentAction}
                      resetOnSuccess={false}
                      className="mt-2"
                    >
                      <input
                        id={`delete-doc-${doc.id}`}
                        type="hidden"
                        name="documentId"
                        value={doc.id}
                      />
                      <SubmitButton
                        variant="danger"
                        confirm={`Delete “${doc.title}”? This cannot be undone.`}
                      >
                        Delete document
                      </SubmitButton>
                    </ActionForm>
                  </details>
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
