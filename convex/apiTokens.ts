import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Internal queries (used by HTTP API auth) ────────────────────────────────

/**
 * Look up an API token by its hash.
 */
export const getByHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("apiTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
  },
});

/**
 * Get a user by ID (internal).
 */
export const getUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// ─── User-facing queries ─────────────────────────────────────────────────────

/**
 * List the current user's API tokens (excludes the hash for security).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return tokens.map((t) => ({
      _id: t._id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
    }));
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "sh_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a new API token. Returns the raw token (only shown once).
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rawToken = generateRawToken();
    const tokenHash = await hashToken(rawToken);
    const tokenPrefix = rawToken.slice(0, 11) + "...";

    await ctx.db.insert("apiTokens", {
      userId,
      name: args.name.trim() || "Unnamed token",
      tokenHash,
      tokenPrefix,
      createdAt: Date.now(),
    });

    return { token: rawToken };
  },
});

/**
 * Revoke an API token.
 */
export const revoke = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const apiToken = await ctx.db.get(args.tokenId);
    if (!apiToken) throw new Error("Token not found");
    if (apiToken.userId !== userId) throw new Error("Not your token");

    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
  },
});
