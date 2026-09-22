"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requireCaptain } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { RatingError, saveRefereeRating } from "@/lib/referee-ratings";

export interface RatingActionState {
  ok?: string;
  error?: string;
}

export async function saveRefereeRatingAction(
  _previous: RatingActionState,
  formData: FormData,
): Promise<RatingActionState> {
  try {
    const user = await requireCaptain();
    await saveRefereeRating(prisma, {
      matchId: String(formData.get("matchId") ?? ""),
      teamId: String(formData.get("teamId") ?? ""),
      rating: Number(formData.get("rating")),
      comment: String(formData.get("comment") ?? ""),
      actor: {
        appUserId: user.appUserId,
        email: user.email,
        name: user.name,
      },
    });
    revalidatePath("/captain/ratings");
    revalidatePath("/admin/ratings");
    revalidatePath("/referee/ratings");
    return { ok: "Your team's private referee rating was saved." };
  } catch (error) {
    if (error instanceof AuthzError) return { error: error.message };
    if (error instanceof RatingError) return { error: error.message };
    console.error("[referee-rating] save failed", error);
    return { error: "The rating could not be saved. Please try again." };
  }
}
