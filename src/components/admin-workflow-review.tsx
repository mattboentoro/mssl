import Link from "next/link";
import type { ReactNode } from "react";

import { ActionForm, SubmitButton, type ServerAction } from "@/components/admin-forms";
import { Card, Field, inputClass } from "@/components/ui";

export function AdminWorkflowReview({
  title,
  matchId,
  action,
  idName,
  idValue,
  noteName,
  noteRequired = false,
  children,
}: {
  title: string;
  matchId: string;
  action: ServerAction;
  idName: string;
  idValue: string;
  noteName: string;
  noteRequired?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Link className="text-brand text-sm hover:underline" href={`/admin/matches/${matchId}`}>
          Match detail
        </Link>
      </div>
      <div className="mt-4">{children}</div>
      <ActionForm action={action} className="mt-5">
        <input type="hidden" name={idName} value={idValue} />
        <input type="hidden" name="matchId" value={matchId} />
        <Field
          label={noteRequired ? "Resolution reason (required)" : "Review note"}
          htmlFor={`${idValue}-note`}
        >
          <textarea
            id={`${idValue}-note`}
            name={noteName}
            rows={3}
            minLength={noteRequired ? 5 : undefined}
            maxLength={2000}
            required={noteRequired}
            className={inputClass}
          />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <SubmitButton
            name="decision"
            value="approve"
            confirm="Apply this approval and its domain transition? The current data shown above will be revalidated first."
          >
            Approve
          </SubmitButton>
          <SubmitButton
            name="decision"
            value="reject"
            variant="danger"
            confirm="Reject this request? The decision and resolution note will be audited and participants notified."
          >
            Reject
          </SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
