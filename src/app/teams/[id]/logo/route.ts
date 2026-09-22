import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getTeamLogoStorage, type TeamLogoContentType } from "@/lib/team-logo-storage";

const allowedContentTypes = new Set<TeamLogoContentType>(["image/png", "image/jpeg", "image/webp"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const team = await prisma.team.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: {
      logoBlobName: true,
      logoContainer: true,
      logoContentType: true,
      logoEtag: true,
    },
  });
  if (
    !team?.logoBlobName ||
    team.logoContainer !== config.teamLogos.container ||
    !allowedContentTypes.has(team.logoContentType as TeamLogoContentType)
  ) {
    return new Response("Logo not found.", { status: 404 });
  }
  const contentType = team.logoContentType as TeamLogoContentType;

  if (team.logoEtag && request.headers.get("if-none-match") === team.logoEtag) {
    return new Response(null, { status: 304, headers: { ETag: team.logoEtag } });
  }

  try {
    const bytes = await getTeamLogoStorage().read(team.logoBlobName);
    if (!bytes) return new Response("Logo not found.", { status: 404 });
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=3600, must-revalidate",
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        ...(team.logoEtag ? { ETag: team.logoEtag } : {}),
      },
    });
  } catch {
    return new Response("Logo temporarily unavailable.", { status: 503 });
  }
}
