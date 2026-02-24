/**
 * Two-phase rate limiting using the rateLimits table.
 *
 * Phase 1 (check): Read-only query — no write conflicts on denied requests.
 * Phase 2 (consume): Mutation — only called when the request is allowed.
 */
import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";

const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  read: { maxRequests: 100, windowMs: 60_000 }, // 100/min
  write: { maxRequests: 10, windowMs: 60_000 }, // 10/min
  search: { maxRequests: 30, windowMs: 60_000 }, // 30/min
};

/**
 * Phase 1: Check if a request is allowed (read-only, no OCC conflicts).
 */
export const check = internalQuery({
  args: { key: v.string(), bucket: v.string() },
  handler: async (ctx, { key, bucket }) => {
    const config = RATE_LIMITS[bucket];
    if (!config) return { allowed: true };

    const now = Date.now();
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_bucket", (q) => q.eq("key", key).eq("bucket", bucket))
      .first();

    if (!record) return { allowed: true };
    if (now - record.windowStart > config.windowMs) return { allowed: true };
    return { allowed: record.count < config.maxRequests };
  },
});

/**
 * Phase 2: Consume a rate limit token (only called after check passes).
 */
export const consume = internalMutation({
  args: { key: v.string(), bucket: v.string() },
  handler: async (ctx, { key, bucket }) => {
    const config = RATE_LIMITS[bucket];
    if (!config) return;

    const now = Date.now();
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_bucket", (q) => q.eq("key", key).eq("bucket", bucket))
      .first();

    if (!record || now - record.windowStart > config.windowMs) {
      if (record) {
        await ctx.db.patch(record._id, { count: 1, windowStart: now });
      } else {
        await ctx.db.insert("rateLimits", { key, bucket, count: 1, windowStart: now });
      }
    } else {
      await ctx.db.patch(record._id, { count: record.count + 1 });
    }
  },
});
