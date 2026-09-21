import fs from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Rules & regulations",
  description: "The MSSL Rules & Regulations, public copy.",
};
// The PDF can be dropped in after a deploy, so check the filesystem per request.
export const dynamic = "force-dynamic";

/**
 * SharePoint refuses to be framed, so the preview is served from our own copy.
 * Drop the latest export at this path and the viewer picks it up.
 */
const PDF_FILE = "mssl-rules-and-regulations.pdf";
const PDF_URL = `/documents/${PDF_FILE}`;

const SHAREPOINT_URL =
  "https://microsoft.sharepoint.com/:b:/r/teams/MicrosoftSoccerLeagueMSSL/SiteAssets/Forms/AllItems.aspx?id=%2Fteams%2FMicrosoftSoccerLeagueMSSL%2FSiteAssets%2FSitePages%2FLatest%2DUpdate%281%29%2FMicrosoft%2DSoccer%2DLeague%2D%2DMSSL%2D%2DRules%2D%2D%2DRegulations%2D%2D%2DPublic%2DCopy%2Epdf&parent=%2Fteams%2FMicrosoftSoccerLeagueMSSL%2FSiteAssets%2FSitePages%2FLatest%2DUpdate%281%29&p=true&share=cQqOdpml%5Fg6QQ6K2o7xtHDwiEgUCyvt5dscpaXrO1pjn2Vhm%2DQ";

export default function RulesPage() {
  const published = fs.existsSync(path.join(process.cwd(), "public", "documents", PDF_FILE));

  return (
    <div>
      <PageHeader
        eyebrow="League handbook"
        title="Rules & regulations"
        description="The rules referees apply on the pitch, exactly as published by the league board."
        actions={
          <a
            href={published ? PDF_URL : SHAREPOINT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border-subtle hover:bg-surface-muted inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          >
            Open the PDF
            <span aria-hidden>&rarr;</span>
          </a>
        }
      />

      {published ? (
        <Card className="overflow-hidden">
          <iframe
            src={PDF_URL}
            title="MSSL Rules &amp; Regulations"
            className="h-[calc(100vh-18rem)] min-h-[32rem] w-full"
          />
        </Card>
      ) : (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">The handbook has not been published here yet</h2>
          <p className="text-muted mt-2 text-sm">
            The rules live on SharePoint, which refuses to be embedded in another site. To show the
            document inline, save the public copy as{" "}
            <code className="bg-surface-muted rounded px-1.5 py-0.5 text-xs">
              public/documents/{PDF_FILE}
            </code>{" "}
            and this page will render it.
          </p>
          <p className="mt-4 text-sm">
            <a
              href={SHAREPOINT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              Read the rules on SharePoint
            </a>{" "}
            <span className="text-muted">(Microsoft sign-in required)</span>
          </p>
        </Card>
      )}
    </div>
  );
}
