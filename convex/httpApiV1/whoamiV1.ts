import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { jsonResponse, errorResponse, extractBearerToken, checkHttpRateLimit } from "./shared";

/**
 * GET /api/v1/whoami — validate token and return user info
 */
export const whoami = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const token = extractBearerToken(request);
  if (!token) return errorResponse("Bearer token required", 401);

  // Hash the token and look up in apiTokens
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const apiToken = await ctx.runQuery(internal.apiTokens.getByHash, { tokenHash });

  if (!apiToken || apiToken.revokedAt) {
    return errorResponse("Invalid or revoked token", 401);
  }

  const user = await ctx.runQuery(internal.apiTokens.getUser, {
    userId: apiToken.userId,
  });

  if (!user || user.deactivatedAt) {
    return errorResponse("Account not found or deactivated", 401);
  }

  return jsonResponse({
    handle: user.handle,
    displayName: user.displayName,
    email: user.email,
    role: user.role ?? "user",
    image: user.image,
  });
});
