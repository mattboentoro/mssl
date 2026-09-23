"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/audit";
import { actorFrom } from "@/lib/api";
import { AuthzError, requireAdmin } from "@/lib/authz";
import { assignableRoleSchema } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { assignGlobalRole, revokeGlobalRole, withSerializedRoleMutation } from "@/lib/rbac";
import { RoleMutationError } from "@/lib/rbac";

export interface RoleActionState {
  ok?: string;
  error?: string;
}

export async function mutateRoleAction(
  _state: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  try {
    const actor = await requireAdmin();
    const userId = String(formData.get("userId") ?? "");
    const parsedRole = assignableRoleSchema.safeParse(String(formData.get("role") ?? ""));
    const operation = String(formData.get("operation") ?? "");
    if (!userId || !parsedRole.success || (operation !== "assign" && operation !== "revoke")) {
      return { error: "Invalid role mutation." };
    }
    const role = parsedRole.data;
    const mutate = async (tx: Prisma.TransactionClient) => {
      if (operation === "assign") {
        await assignGlobalRole(tx, { userId, role, actorId: actor.appUserId });
      } else {
        await revokeGlobalRole(tx, { userId, role, actorId: actor.appUserId });
      }
      await writeAudit(tx, {
        actor: actorFrom(actor),
        action: `role.${operation}`,
        entity: "AppUser",
        entityId: userId,
        metadata: { role },
      });
    };
    if (operation === "revoke" && role === "ADMIN") {
      await withSerializedRoleMutation(prisma, mutate);
    } else {
      await prisma.$transaction(mutate);
    }
    revalidatePath("/admin/users");
    revalidatePath("/", "layout");
    return { ok: `${role} role ${operation === "assign" ? "added" : "removed"}.` };
  } catch (error) {
    if (error instanceof RoleMutationError || error instanceof AuthzError) {
      return { error: error.message };
    }
    console.error("[role-mutation] action failed", error);
    return { error: "The role could not be changed. Refresh and try again." };
  }
}
