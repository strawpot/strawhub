import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { jsonResponse, errorResponse, corsResponse } from "./shared";

/**
 * POST /api/v1/downloads
 * Body: { "kind": "skill"|"role"|"agent"|"memory", "slug": "...", "version": "..." }
 *
 * No auth required — download tracking is public (like npm).
 */
export const trackDownload = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return corsResponse();

  let body: { kind?: string; slug?: string; version?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { kind, slug, version } = body;
  if (!kind || !slug) {
    return errorResponse("kind and slug are required", 400);
  }

  const validKinds = ["skill", "role", "agent", "memory"];
  if (!validKinds.includes(kind)) {
    return errorResponse(`kind must be one of: ${validKinds.join(", ")}`, 400);
  }

  await ctx.runMutation(api.downloads.trackDownload, {
    targetKind: kind as "skill" | "role" | "agent" | "memory",
    slug,
    version,
  });

  return jsonResponse({ ok: true });
});
