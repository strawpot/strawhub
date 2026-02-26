import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { jsonResponse, errorResponse, resolveTokenToUser, checkHttpRateLimit } from "./shared";

/**
 * POST /api/v1/stars/toggle — toggle star on a skill or role
 * Body: { "slug": "...", "kind": "skill"|"role" }
 */
export const toggleStar = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "write");
  if (rateLimited) return rateLimited;

  const authResult = await resolveTokenToUser(ctx, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { slug, kind } = body;
  if (!slug || !kind) return errorResponse("slug and kind are required", 400);
  if (kind !== "skill" && kind !== "role") {
    return errorResponse("kind must be 'skill' or 'role'", 400);
  }

  // Look up the target by slug to get its _id
  const target = kind === "skill"
    ? await ctx.runQuery(api.skills.getBySlug, { slug })
    : await ctx.runQuery(api.roles.getBySlug, { slug });
  if (!target) return errorResponse(`${kind} '${slug}' not found`, 404);

  try {
    const result = await ctx.runMutation(internal.stars.toggleInternal, {
      userId,
      targetId: target._id,
      targetKind: kind,
    });
    return jsonResponse(result);
  } catch (e: any) {
    return errorResponse(e.message || "Failed to toggle star", 400);
  }
});
