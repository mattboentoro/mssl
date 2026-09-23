"use client";

import {
  deleteTeamLogoAction,
  updateTeamProfileAction,
  uploadTeamLogoAction,
} from "@/app/captain/teams/[id]/profile/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { TeamLogo } from "@/components/team-logo";
import { Card, Field, inputClass } from "@/components/ui";

export function TeamProfileForm({
  team,
}: {
  team: {
    id: string;
    name: string;
    shortName: string;
    colorPrimary: string;
    colorAlternate: string;
    logoBlobName: string | null;
  };
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Club details</h2>
        <ActionForm action={updateTeamProfileAction} resetOnSuccess={false} className="grid gap-4">
          <input type="hidden" name="teamId" value={team.id} />
          <Field label="Name" htmlFor="team-profile-name">
            <input
              id="team-profile-name"
              name="name"
              defaultValue={team.name}
              maxLength={120}
              className={inputClass}
              required
            />
            <FieldError name="name" />
          </Field>
          <Field
            label="Short name"
            htmlFor="team-profile-short-name"
            hint="Shown where the full club name does not fit."
          >
            <input
              id="team-profile-short-name"
              name="shortName"
              defaultValue={team.shortName}
              maxLength={24}
              className={inputClass}
              required
            />
            <FieldError name="shortName" />
          </Field>
          <Field
            label="Primary colour"
            htmlFor="team-profile-primary-label"
            hint="Home / first-choice kit."
          >
            <ColorPalettePicker
              name="colorPrimary"
              defaultValue={team.colorPrimary}
              labelledBy="team-profile-primary-label"
            />
            <FieldError name="colorPrimary" />
          </Field>
          <Field
            label="Alternate colour"
            htmlFor="team-profile-alternate-label"
            hint="Worn when the kits would clash."
          >
            <ColorPalettePicker
              name="colorAlternate"
              defaultValue={team.colorAlternate}
              labelledBy="team-profile-alternate-label"
            />
            <FieldError name="colorAlternate" />
          </Field>
          <div>
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Team logo</h2>
        <div className="my-5 flex justify-center">
          <TeamLogo
            teamId={team.id}
            name={team.name}
            hasLogo={Boolean(team.logoBlobName)}
            size={128}
          />
        </div>
        <ActionForm action={uploadTeamLogoAction} resetOnSuccess={false} className="space-y-3">
          <input type="hidden" name="teamId" value={team.id} />
          <Field
            label="New logo"
            htmlFor="team-profile-logo"
            hint="PNG, JPEG, or WebP. Maximum 2 MiB."
          >
            <input
              id="team-profile-logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={inputClass}
              required
            />
          </Field>
          <SubmitButton>Upload logo</SubmitButton>
        </ActionForm>
        {team.logoBlobName ? (
          <ActionForm action={deleteTeamLogoAction} resetOnSuccess={false} className="mt-3">
            <input type="hidden" name="teamId" value={team.id} />
            <SubmitButton variant="danger" confirm="Remove this team logo?">
              Remove logo
            </SubmitButton>
          </ActionForm>
        ) : null}
      </Card>
    </div>
  );
}
