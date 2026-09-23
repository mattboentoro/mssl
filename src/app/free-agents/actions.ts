"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/admin/actions";
import { actorFrom } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { AuthzError, requireUser } from "@/lib/authz";
import type { SessionUser } from "@/lib/authz";
import { OPEN_FREE_AGENT_STATUSES, type FreeAgentStatus } from "@/lib/enums";
import {
  FreeAgentEligibilityError,
  requireFreeAgentEligibility,
} from "@/lib/free-agent-eligibility";
import { prisma } from "@/lib/prisma";
import { flattenZodError, freeAgentRequestSchema } from "@/lib/validation";

/**
 * Server actions behind the public free-agent form.
 *
 * Match Control's `run()` helper cannot be reused here because it starts by
 * demanding an administrator. These are the same shape — validate, act, return
 * `{ ok }` or `{ error }` at HTTP 200 — but gated on merely being signed in.
 */

/** Resolve the caller, turning the 401 into a message the form can render. */
async function currentPlayer(): Promise<SessionUser | { error: string }> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AuthzError) {
      return { error: "Sign in with your Microsoft account to submit a request." };
    }
    throw error;
  }
}

/**
 * The address the request is filed under.
 *
 * Lower-cased because it is the unique key: signing in as `A@x.com` has to find
 * the request filed as `a@x.com` rather than opening a second one alongside it.
 */
function contactEmail(user: SessionUser): string | null {
  const email = user.email?.trim().toLowerCase();
  return email && email.length > 0 ? email : null;
}

function str(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function submitFreeAgentRequest(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const user = await currentPlayer();
  if ("error" in user) return user;

  const email = contactEmail(user);
  if (!email) {
    return { error: "Your account has no e-mail address, so the league has no way to reply." };
  }
  try {
    await requireFreeAgentEligibility(prisma, user.appUserId);
  } catch (error) {
    if (error instanceof FreeAgentEligibilityError) {
      return { error: error.message };
    }
    throw error;
  }

  const parsed = freeAgentRequestSchema.safeParse({
    yearsExperience: form.get("yearsExperience"),
    preferredPosition: str(form, "preferredPosition"),
    preferredDivisionId: str(form, "preferredDivisionId"),
    notes: str(form, "notes"),
  });

  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: flattenZodError(parsed.error),
    };
  }

  const input = parsed.data;

  // Checked rather than left to the foreign key, so a division that has been
  // removed since the page rendered comes back as a field error, not a 500.
  if (input.preferredDivisionId) {
    const division = await prisma.division.findUnique({
      where: { id: input.preferredDivisionId },
      select: { id: true },
    });
    if (!division) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { preferredDivisionId: "Pick a division from the list." },
      };
    }
  }

  const existing = await prisma.freeAgentRequest.findUnique({
    where: { submittedByEmail: email },
    select: { id: true, status: true },
  });

  // A request the league has already closed is reopened by submitting again;
  // one still in play keeps its status, so an administrator's work in progress
  // is not thrown away by a player correcting their answers.
  const reopened =
    existing !== null && !OPEN_FREE_AGENT_STATUSES.includes(existing.status as FreeAgentStatus);

  const answers = {
    submittedById: user.id ?? null,
    submittedByName: user.name?.trim() || email,
    yearsExperience: input.yearsExperience,
    preferredPosition: input.preferredPosition,
    preferredDivisionId: input.preferredDivisionId,
    notes: input.notes,
  };

  const saved = existing
    ? await prisma.freeAgentRequest.update({
        where: { id: existing.id },
        data: reopened
          ? {
              ...answers,
              status: "PENDING",
              reviewNote: null,
              reviewedAt: null,
              reviewedByEmail: null,
            }
          : answers,
      })
    : await prisma.freeAgentRequest.create({
        data: { ...answers, submittedByEmail: email },
      });

  await writeAudit(prisma, {
    actor: actorFrom(user),
    action: existing ? "free_agent.update" : "free_agent.submit",
    entity: "FreeAgentRequest",
    entityId: saved.id,
    metadata: {
      yearsExperience: saved.yearsExperience,
      preferredPosition: saved.preferredPosition,
      preferredDivisionId: saved.preferredDivisionId,
      reopened,
    },
  });

  revalidatePath("/free-agents");
  revalidatePath("/admin/free-agents");

  return {
    ok: existing
      ? "Your request has been updated. The league will be in touch."
      : "Thanks \u2014 your request is with the league.",
  };
}

export async function withdrawFreeAgentRequest(
  _prev: ActionState,
  _form: FormData,
): Promise<ActionState> {
  const user = await currentPlayer();
  if ("error" in user) return user;

  const email = contactEmail(user);
  if (!email) return { error: "Your account has no e-mail address." };

  const existing = await prisma.freeAgentRequest.findUnique({
    where: { submittedByEmail: email },
    select: { id: true },
  });
  if (!existing) return { error: "You do not have a request on file." };

  await prisma.freeAgentRequest.delete({ where: { id: existing.id } });

  await writeAudit(prisma, {
    actor: actorFrom(user),
    action: "free_agent.withdraw",
    entity: "FreeAgentRequest",
    entityId: existing.id,
    metadata: {},
  });

  revalidatePath("/free-agents");
  revalidatePath("/admin/free-agents");

  return { ok: "Your request has been withdrawn." };
}
