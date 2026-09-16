import {
  createAnnouncementAction,
  createDocumentAction,
  deleteAnnouncementAction,
  deleteDocumentAction,
  updateAnnouncementAction,
  updateDocumentAction,
} from "@/app/admin/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { CloseOnSuccess, Dialog, DialogCancel } from "@/components/form-dialog";
import { Badge, Card, Field, inputClass, outlineButtonClass } from "@/components/ui";
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="announcements" className="text-lg font-semibold">
            Announcements
          </h2>
          <Dialog
            trigger="Publish announcement"
            triggerClassName={outlineButtonClass}
            title="Publish an announcement"
            description="Announcements appear on the home page and the news feed. Pinned items stay at the top."
          >
            <ActionForm action={createAnnouncementAction} showSuccess={false} className="space-y-3">
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
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pinned" className="h-4 w-4" />
                Pin to the home page
              </label>
              <div className="border-subtle flex justify-end gap-2 border-t pt-3">
                <DialogCancel />
                <SubmitButton>Publish</SubmitButton>
              </div>
              <CloseOnSuccess />
            </ActionForm>
          </Dialog>
        </div>
        <Card className="divide-subtle divide-y">
          {announcements.length === 0 ? (
            <p className="text-muted p-4 text-sm">Nothing published yet.</p>
          ) : (
            announcements.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {item.pinned ? (
                      <Badge tone="accent" className="mr-2">
                        Pinned
                      </Badge>
                    ) : null}
                    {item.title}
                  </p>
                  <p className="text-muted text-xs">
                    {item.publishedAt ? formatDate(item.publishedAt) : "Draft"}
                  </p>
                  <p className="text-muted mt-1 text-sm">{item.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Dialog
                    trigger="Edit"
                    triggerLabel={`Edit ${item.title}`}
                    triggerClassName={outlineButtonClass}
                    title="Edit announcement"
                    description="Update the published announcement. Saving keeps its original publication date."
                  >
                    <ActionForm
                      action={updateAnnouncementAction}
                      showSuccess={false}
                      className="space-y-3"
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
                          rows={6}
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
                      <div className="border-subtle flex justify-end gap-2 border-t pt-3">
                        <DialogCancel />
                        <SubmitButton>Save changes</SubmitButton>
                      </div>
                      <CloseOnSuccess />
                    </ActionForm>
                  </Dialog>
                  <ActionForm action={deleteAnnouncementAction} resetOnSuccess={false}>
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
                      Delete
                    </SubmitButton>
                  </ActionForm>
                </div>
              </article>
            ))
          )}
        </Card>
      </section>

      <section aria-labelledby="documents">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="documents" className="text-lg font-semibold">
            Documents &amp; downloads
          </h2>
          <Dialog
            trigger="Add document"
            triggerClassName={outlineButtonClass}
            title="Add a document"
            description="Link a file that already lives somewhere the league can reach — SharePoint, OneDrive, or any public URL."
          >
            <ActionForm
              action={createDocumentAction}
              showSuccess={false}
              className="grid gap-3 sm:grid-cols-2"
            >
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
              <div className="border-subtle flex justify-end gap-2 border-t pt-3 sm:col-span-2">
                <DialogCancel />
                <SubmitButton>Add document</SubmitButton>
              </div>
              <CloseOnSuccess />
            </ActionForm>
          </Dialog>
        </div>
        <Card className="divide-subtle divide-y">
          {documents.length === 0 ? (
            <p className="text-muted p-4 text-sm">No documents yet.</p>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-muted text-xs">
                    {DOCUMENT_CATEGORY_LABELS[
                      doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                    ] ?? doc.category}
                    {doc.fileType ? ` \u00B7 ${doc.fileType}` : ""}
                  </p>
                  {doc.description ? <p className="text-muted mt-1">{doc.description}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Dialog
                    trigger="Edit"
                    triggerLabel={`Edit ${doc.title}`}
                    triggerClassName={outlineButtonClass}
                    title="Edit document"
                    description="Update how this document appears and where its link points."
                  >
                    <ActionForm
                      action={updateDocumentAction}
                      showSuccess={false}
                      className="grid gap-3 sm:grid-cols-2"
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
                      <div className="border-subtle flex justify-end gap-2 border-t pt-3 sm:col-span-2">
                        <DialogCancel />
                        <SubmitButton>Save changes</SubmitButton>
                      </div>
                      <CloseOnSuccess />
                    </ActionForm>
                  </Dialog>
                  <ActionForm action={deleteDocumentAction} resetOnSuccess={false}>
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
                      Delete
                    </SubmitButton>
                  </ActionForm>
                </div>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
