import Link from "next/link";
import type { ReactNode } from "react";

import { ActionForm, SubmitButton, type ServerAction } from "@/components/admin-forms";
import { MatchDisclosureHint, MatchDisclosureStack } from "@/components/match-display";
import { Card, Field, inputClass } from "@/components/ui";

export function AdminWorkflowReview({
  title,
  matchId,
  action,
  idName,
  idValue,
  noteName,
  noteRequired = false,
  summary,
  children,
}: {
  title: string;
  matchId: string;
  action: ServerAction;
  idName: string;
  idValue: string;
  noteName: string;
  noteRequired?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const content = (
    <>
      <div
        className={`flex flex-wrap items-start gap-3 ${summary ? "justify-end" : "justify-between"}`}
      >
        {summary ? null : <h3 className="font-semibold">{title}</h3>}
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
    </>
  );

  if (summary) {
    return (
      <MatchDisclosureStack>
        <Card as="details" className="group overflow-hidden">
          <summary className="hover:bg-surface-muted cursor-pointer list-none px-5 py-4 transition">
            {summary}
            <MatchDisclosureHint label="Expand workflow review" />
          </summary>
          <div className="border-subtle border-t p-5">{content}</div>
        </Card>
      </MatchDisclosureStack>
    );
  }

  return <Card className="p-5">{content}</Card>;
}
