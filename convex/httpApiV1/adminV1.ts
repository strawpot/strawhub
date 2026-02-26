import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { jsonResponse, errorResponse, resolveTokenToUser, checkHttpRateLimit } from "./shared";

/**
 * POST /api/v1/admin/set-role — change a user's role (admin only)
 * Body: { "handle": "...", "role": "admin"|"moderator"|"user" }
 */
export const setUserRole = httpAction(async (ctx, request) => {
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

  const { handle, role } = body;
  if (!handle || !role) return errorResponse("handle and role are required", 400);
  if (!["admin", "moderator", "user"].includes(role)) {
    return errorResponse("role must be 'admin', 'moderator', or 'user'", 400);
  }

  try {
    const result = await ctx.runMutation(internal.users.setRoleInternal, {
      actorUserId: userId,
      targetHandle: handle,
      role,
    });
    return jsonResponse(result);
  } catch (e: any) {
    return errorResponse(e.message || "Failed to set role", 400);
  }
});

/**
 * POST /api/v1/admin/ban-user — ban or unban a user (admin only)
 * Body: { "handle": "...", "blocked": true|false, "reason"?: "..." }
 */
export const banUser = httpAction(async (ctx, request) => {
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

  const { handle, blocked, reason } = body;
  if (!handle || blocked === undefined) {
    return errorResponse("handle and blocked are required", 400);
  }

  try {
    const result = await ctx.runMutation(internal.users.setBlockedInternal, {
      actorUserId: userId,
      targetHandle: handle,
      blocked: !!blocked,
      banReason: reason,
    });
    return jsonResponse(result);
  } catch (e: any) {
    return errorResponse(e.message || "Failed to update user", 400);
  }
});
