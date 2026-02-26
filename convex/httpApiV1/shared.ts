import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Helper to create JSON responses.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Error response helper.
 */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/**
 * Parse query params from a request URL.
 */
export function getSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/**
 * Hash a token string to SHA-256 hex.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve a Bearer token to a user. Returns the userId and user doc,
 * or a Response if auth fails.
 */
export async function resolveTokenToUser(
  ctx: ActionCtx,
  request: Request,
): Promise<{ userId: Id<"users">; user: any } | Response> {
  const token = extractBearerToken(request);
  if (!token) return errorResponse("Bearer token required", 401);

  const tokenHash = await hashToken(token);
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

  return { userId: apiToken.userId, user };
}

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Check rate limit for an HTTP request. Returns a 429 Response if limited, null if allowed.
 */
export async function checkHttpRateLimit(
  ctx: ActionCtx,
  request: Request,
  bucket: string,
): Promise<Response | null> {
  const ip = getClientIp(request);
  const key = `ip:${ip}`;
  const { allowed } = await ctx.runQuery(internal.lib.rateLimit.check, {
    key,
    bucket,
  });
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": "60",
      },
    });
  }
  await ctx.runMutation(internal.lib.rateLimit.consume, { key, bucket });
  return null;
}

/**
 * CORS preflight response.
 */
export function corsResponse(): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
