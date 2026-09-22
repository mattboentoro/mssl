"use server";

import { revalidatePath } from "next/cache";

import { relinkCaptainIdentity, AdminRosterError } from "@/lib/admin-roster";
import { AuthzError, requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export interface AdminRosterActionState {
  ok?: string;
  error?: string;
}

export async function relinkCaptainAction(
  _state: AdminRosterActionState,
  form: FormData,
): Promise<AdminRosterActionState> {
  try {
    const user = await requireAdmin();
    await relinkCaptainIdentity(prisma, {
      captainId: String(form.get("captainId") ?? ""),
      seasonId: String(form.get("seasonId") ?? ""),
      expectedUpdatedAt: String(form.get("expectedUpdatedAt") ?? ""),
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    });
    revalidatePath("/admin/roster");
    revalidatePath("/admin/league");
    revalidatePath("/captain/roster");
    return { ok: "Captain identity link updated." };
  } catch (error) {
    if (error instanceof AdminRosterError || error instanceof AuthzError) {
      return { error: error.message };
    }
    console.error("[admin-roster] relink failed", error);
    return { error: "The Captain identity could not be updated. Refresh and try again." };
  }
}
