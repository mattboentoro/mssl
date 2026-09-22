"use server";

import { revalidatePath } from "next/cache";

import { actorFrom } from "@/lib/api";
import {
  AuthzError,
  requireCaptainForTeam,
  requireUser,
  type SessionUser,
} from "@/lib/authz";
import {
  getTeamLogoStorage,
  validateTeamLogo,
  MAX_TEAM_LOGO_BYTES,
} from "@/lib/team-logo-storage";
import { deleteTeamLogo, replaceTeamLogo, updateTeamProfile } from "@/lib/team-profile";
import { flattenZodError, teamProfileSchema } from "@/lib/validation";

export interface TeamProfileActionState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireTeamProfileManager(teamId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isAdmin) return user;
  return (await requireCaptainForTeam(teamId)).user;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function refresh(teamId: string): void {
  revalidatePath(`/captain/teams/${teamId}/profile`);
  revalidatePath("/teams", "layout");
}

export async function updateTeamProfileAction(
  _previous: TeamProfileActionState,
  form: FormData,
): Promise<TeamProfileActionState> {
  const input = {
    teamId: text(form, "teamId"),
    name: text(form, "name"),
    shortName: text(form, "shortName"),
    colorPrimary: text(form, "colorPrimary"),
    colorAlternate: text(form, "colorAlternate"),
  };
  const parsed = teamProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: flattenZodError(parsed.error),
    };
  }

  try {
    const actor = await requireTeamProfileManager(parsed.data.teamId);
    const { teamId, ...profile } = parsed.data;
    await updateTeamProfile(teamId, profile, actorFrom(actor));
    refresh(teamId);
    return { ok: "Team profile updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function uploadTeamLogoAction(
  _previous: TeamProfileActionState,
  form: FormData,
): Promise<TeamProfileActionState> {
  const teamId = text(form, "teamId");
  const file = form.get("logo");
  if (!teamId) return { error: "A team is required." };
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return { error: "Choose a logo file." };
  }
  if (file.size > MAX_TEAM_LOGO_BYTES) {
    return { error: "Team logos must be 2 MiB or smaller." };
  }

  try {
    const actor = await requireTeamProfileManager(teamId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = validateTeamLogo(bytes, file.type);
    await replaceTeamLogo({
      teamId,
      bytes,
      contentType,
      actor: actorFrom(actor),
      storage: getTeamLogoStorage(),
    });
    refresh(teamId);
    return { ok: "Team logo updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteTeamLogoAction(
  _previous: TeamProfileActionState,
  form: FormData,
): Promise<TeamProfileActionState> {
  const teamId = text(form, "teamId");
  if (!teamId) return { error: "A team is required." };
  try {
    const actor = await requireTeamProfileManager(teamId);
    await deleteTeamLogo({
      teamId,
      actor: actorFrom(actor),
      storage: getTeamLogoStorage(),
    });
    refresh(teamId);
    return { ok: "Team logo removed." };
  } catch (error) {
    return actionError(error);
  }
}

function actionError(error: unknown): TeamProfileActionState {
  if (error instanceof AuthzError) return { error: error.message };
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}
