import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";

import { TeamProfileForm } from "@/components/team-profile-form";
import { PageHeader } from "@/components/ui";
import { AuthzError, requireCaptainForTeam, requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Team profile" };
export const dynamic = "force-dynamic";

export default async function TeamProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireUser();
    if (!user.isAdmin) await requireCaptainForTeam(id);
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.status === 401) redirect(`/signin?callbackUrl=/captain/teams/${id}/profile`);
      forbidden();
    }
    throw error;
  }

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      shortName: true,
      colorPrimary: true,
      colorAlternate: true,
      logoBlobName: true,
    },
  });
  if (!team) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Team management"
        title={team.name}
        description="Update the club identity shared across public, Captain, and Admin views. Web addresses remain Admin-only."
      />
      <TeamProfileForm team={team} />
    </div>
  );
}
