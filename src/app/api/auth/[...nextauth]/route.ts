import { handlers } from "@/auth";

// Prisma (used during role resolution) cannot run on the Edge runtime.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
