import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { jsonResponse, errorResponse, corsResponse, extractBearerToken, hashToken } from "./shared";
import { internal } from "../_generated/api";

/**
 * POST /api/v1/downloads
 * Body: { "kind": "skill"|"role"|"agent"|"memory", "slug": "...", "version": "..." }
 *
 * Auth is optional — authenticated requests are deduplicated per user.
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

  // Optionally resolve user from auth token for per-user dedup
  let userId: string | undefined;
  const token = extractBearerToken(request);
  if (token) {
    try {
      const tokenHash = await hashToken(token);
      const apiToken = await ctx.runQuery(internal.apiTokens.getByHash, { tokenHash });
      if (apiToken && !apiToken.revokedAt) {
        userId = apiToken.userId;
      }
    } catch {
      // Auth failure is fine — treat as anonymous
    }
  }

  await ctx.runMutation(api.downloads.trackDownload, {
    targetKind: kind as "skill" | "role" | "agent" | "memory",
    slug,
    version,
    userId,
  });

  return jsonResponse({ ok: true });
});
