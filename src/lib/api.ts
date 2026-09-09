import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { AuthzError, type SessionUser } from "@/lib/authz";
import { MatchError } from "@/lib/matches";
import { flattenZodError } from "@/lib/validation";

/**
 * Shared plumbing for the JSON API routes.
 *
 * Every route handler is wrapped by `handleApi`, which turns the typed errors
 * thrown by the authz and match modules into the right HTTP status. That means
 * a route can simply call `requireReferee()` and `assignRefereeToMatch()` and
 * never think about status codes — and, crucially, that an unexpected error can
 * never fall through as a 200.
 */

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string>;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: message, code, ...(fields ? { fields } : {}) },
    { status },
  );
}

export async function handleApi<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    if (error instanceof AuthzError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof MatchError) {
      return apiError(error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Some fields need attention.",
        flattenZodError(error),
      );
    }
    console.error("[api] unhandled error", error);
    return apiError(500, "INTERNAL", "Something went wrong. Please try again.");
  }
}

/** Parse a JSON body against a schema. An empty body is treated as `{}`. */
export async function parseJson<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<ReturnType<S["parse"]>> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new MatchError("Request body must be valid JSON.", 400, "INVALID_STATE");
    }
  }
  return schema.parse(raw) as ReturnType<S["parse"]>;
}

/** Build the audit actor that every mutation in `matches.ts` expects. */
export function actorFrom(user: SessionUser, refereeId?: string | null) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.isAdmin ? "admin" : user.isReferee ? "referee" : "viewer",
    refereeId: refereeId ?? null,
    isAdmin: user.isAdmin,
  };
}
