import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Toggle a star on a skill or role. Returns whether the item is now starred.
 */
export const toggle = mutation({
  args: {
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role")),
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

    const table = args.targetKind === "skill" ? "skills" : "roles";

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
 */
export const listStarredIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const stars = await ctx.db
      .query("stars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return stars.map((s) => s.targetId);
  },
});

/**
 * Get the current user's starred items with resolved details.
 */
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { skills: [], roles: [] };

    const stars = await ctx.db
      .query("stars")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const skills: Array<{
      _id: string;
      slug: string;
      displayName: string;
      summary?: string;
      stats: { downloads: number; stars: number; versions: number; comments: number };
      starredAt: number;
    }> = [];
    const roles: Array<{
      _id: string;
      slug: string;
      displayName: string;
      summary?: string;
      stats: { downloads: number; stars: number; versions: number; comments: number };
      starredAt: number;
    }> = [];

    for (const star of stars) {
      const target = await ctx.db.get(star.targetId as any);
      if (!target || (target as any).softDeletedAt) continue;
      const item = {
        _id: target._id,
        slug: (target as any).slug,
        displayName: (target as any).displayName,
        summary: (target as any).summary,
        stats: (target as any).stats,
        starredAt: star.createdAt,
      };
      if (star.targetKind === "skill") {
        skills.push(item);
      } else {
        roles.push(item);
      }
    }

    return { skills, roles };
  },
});
