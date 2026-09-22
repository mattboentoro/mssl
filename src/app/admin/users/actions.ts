"use server";

import { revalidatePath } from "next/cache";

import { writeAudit } from "@/lib/audit";
import { actorFrom } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { assignableRoleSchema } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { assignGlobalRole, revokeGlobalRole } from "@/lib/rbac";

export async function mutateRoleAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = assignableRoleSchema.parse(String(formData.get("role") ?? ""));
  const operation = String(formData.get("operation") ?? "");
  if (!userId || (operation !== "assign" && operation !== "revoke")) {
    throw new Error("Invalid role mutation.");
  }

  await prisma.$transaction(async (tx) => {
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
  });
  revalidatePath("/admin/users");
  revalidatePath("/", "layout");
}
