import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Toggle a star on a skill or role. Returns whether the item is now starred.
 */
export const toggle = mutation({
  args: {
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("stars")
      .withIndex("by_target_user", (q) =>
        q.eq("targetId", args.targetId).eq("userId", userId),
      )
      .first();

    const table = args.targetKind === "skill" ? "skills" : args.targetKind === "role" ? "roles" : "agents";

    if (existing) {
      await ctx.db.delete(existing._id);
      // Decrement stats.stars
      const target = await ctx.db.get(existing.targetId as any);
      if (target) {
        await ctx.db.patch(target._id, {
          stats: {
            ...(target as any).stats,
            stars: Math.max(0, (target as any).stats.stars - 1),
          },
        });
      }
      return { starred: false };
    }

    await ctx.db.insert("stars", {
      targetId: args.targetId,
      targetKind: args.targetKind,
      userId,
      createdAt: Date.now(),
    });

    // Increment stats.stars
    const target = await ctx.db.get(args.targetId as any);
    if (target) {
      await ctx.db.patch(target._id, {
        stats: {
          ...(target as any).stats,
          stars: (target as any).stats.stars + 1,
        },
      });
    }

    return { starred: true };
  },
});

/**
 * Toggle a star via API token auth (accepts explicit userId).
 */
export const toggleInternal = internalMutation({
  args: {
    userId: v.id("users"),
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role"), v.literal("agent")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stars")
      .withIndex("by_target_user", (q) =>
        q.eq("targetId", args.targetId).eq("userId", args.userId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      const target = await ctx.db.get(existing.targetId as any);
      if (target) {
        await ctx.db.patch(target._id, {
          stats: {
            ...(target as any).stats,
            stars: Math.max(0, (target as any).stats.stars - 1),
          },
        });
      }
      return { starred: false };
    }

    await ctx.db.insert("stars", {
      targetId: args.targetId,
      targetKind: args.targetKind,
      userId: args.userId,
      createdAt: Date.now(),
    });

    const target = await ctx.db.get(args.targetId as any);
    if (target) {
      await ctx.db.patch(target._id, {
        stats: {
          ...(target as any).stats,
          stars: (target as any).stats.stars + 1,
        },
      });
    }

    return { starred: true };
  },
});

/**
 * Check if the current user has starred a target.
 */
export const isStarred = query({
  args: { targetId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const star = await ctx.db
      .query("stars")
      .withIndex("by_target_user", (q) =>
        q.eq("targetId", args.targetId).eq("userId", userId),
      )
      .first();
    return !!star;
  },
});

/**
 * Get list of targetIds the current user has starred (for list page lookups).
 * Uses cursor-based pagination. Frontend should use a large initialNumItems
 * since this returns just IDs (tiny payload) and needs all results for .includes() checks.
 */
export const listStarredIds = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { page: [] as string[], isDone: true, continueCursor: "" as any };
    }

    const result = await ctx.db
      .query("stars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((s) => s.targetId),
    };
  },
});

/**
 * Get the current user's starred items with resolved details.
 * Returns a flat paginated list; frontend groups by kind.
 */
export const listByUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { page: [] as any[], isDone: true, continueCursor: "" as any };
    }

    const result = await ctx.db
      .query("stars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate(args.paginationOpts);

    // Batch-fetch all targets in parallel to avoid N+1
    const targets = await Promise.all(
      result.page.map((star) => ctx.db.get(star.targetId as any)),
    );

    const enriched = result.page
      .map((star, i) => {
        const target = targets[i];
        if (!target || (target as any).softDeletedAt) return null;
        return {
          _id: target._id,
          kind: star.targetKind,
          slug: (target as any).slug,
          displayName: (target as any).displayName,
          summary: (target as any).summary,
          stats: (target as any).stats,
          starredAt: star.createdAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return { ...result, page: enriched };
  },
});
