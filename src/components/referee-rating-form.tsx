"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveRefereeRatingAction, type RatingActionState } from "@/app/captain/ratings/actions";
import { Alert, buttonClass, labelClass } from "@/components/ui";
import { MAX_RATING_COMMENT_LENGTH } from "@/lib/referee-ratings";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? "Saving\u2026" : "Save private rating"}
    </button>
  );
}

export function RefereeRatingForm({
  matchId,
  teamId,
  existingRating,
  existingComment,
}: {
  matchId: string;
  teamId: string;
  existingRating?: number;
  existingComment?: string | null;
}) {
  const [state, action] = useActionState<RatingActionState, FormData>(saveRefereeRatingAction, {});

  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamId" value={teamId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <fieldset>
        <legend className={labelClass}>Rating (required)</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              className="border-subtle has-checked:border-brand has-checked:bg-brand/10 cursor-pointer rounded-lg border px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="rating"
                value={star}
                required
                defaultChecked={existingRating === star}
                className="mr-2"
              />
              {star} <span aria-hidden="true">&#9733;</span>
              <span className="sr-only">{star === 1 ? " star" : " stars"}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`rating-comment-${matchId}-${teamId}`} className={labelClass}>
          Private comment (optional)
        </label>
        <textarea
          id={`rating-comment-${matchId}-${teamId}`}
          name="comment"
          maxLength={MAX_RATING_COMMENT_LENGTH}
          rows={3}
          defaultValue={existingComment ?? ""}
          aria-describedby={`rating-comment-hint-${matchId}-${teamId}`}
          className="bg-surface border-subtle w-full rounded-lg border px-3 py-2 text-sm shadow-sm"
        />
        <p id={`rating-comment-hint-${matchId}-${teamId}`} className="text-muted mt-1 text-xs">
          Visible to league administrators only. Maximum {MAX_RATING_COMMENT_LENGTH} characters.
        </p>
      </div>
      <SaveButton />
    </form>
  );
}
