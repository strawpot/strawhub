import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { jsonResponse, errorResponse, resolveTokenToUser, checkHttpRateLimit } from "./shared";

/**
 * POST /api/v1/stars/toggle — toggle star on a skill, role, or agent
 * Body: { "slug": "...", "kind": "skill"|"role"|"agent" }
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
  if (kind !== "skill" && kind !== "role" && kind !== "agent" && kind !== "memory") {
    return errorResponse("kind must be 'skill', 'role', 'agent', or 'memory'", 400);
  }

  // Look up the target by slug to get its _id
  const target = kind === "skill"
    ? await ctx.runQuery(api.skills.getBySlug, { slug })
    : kind === "role"
      ? await ctx.runQuery(api.roles.getBySlug, { slug })
      : kind === "memory"
        ? await ctx.runQuery(api.memories.getBySlug, { slug })
        : await ctx.runQuery(api.agents.getBySlug, { slug });
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
