import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/authz";

export default async function AdminRosterPage() {
  await requireAdmin();
  redirect("/captain/roster");
}
