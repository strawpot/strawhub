import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isModerator } from "./lib/access";

/**
 * List comments for a skill or role, newest first (cursor-based pagination).
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const paginatedResult = await ctx.db
      .query("comments")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .order("desc")
      .paginate(args.paginationOpts);

    const userId = await getAuthUserId(ctx);
    const canModerate = userId ? await isModerator(ctx, userId) : false;

    // Batch-fetch unique user docs to avoid N+1
    const userIds = [...new Set(paginatedResult.page.map((c) => c.userId))];
    const userDocs = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(userIds.map((id, i) => [id, userDocs[i]]));

    const enriched = paginatedResult.page.map((comment) => {
      const deleted = !!comment.softDeletedAt;
      const user = userMap.get(comment.userId);
      return {
        _id: comment._id,
        body: deleted ? null : comment.body,
        createdAt: comment.createdAt,
        deleted,
        canDelete: !deleted && (userId === comment.userId || canModerate),
        author: deleted
          ? null
          : user
            ? {
                displayName: user.displayName,
                handle: user.handle,
                image: user.image,
              }
            : null,
      };
    });

    return {
      ...paginatedResult,
      page: enriched,
    };
  },
});

/**
 * Add a comment to a skill or role.
 */
export const create = mutation({
  args: {
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role"), v.literal("agent"), v.literal("memory")),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const target = await ctx.db.get(args.targetId as any);
    if (!target) throw new Error("Target not found");

    const body = args.body.trim();
    if (!body) throw new Error("Comment body is required");
    if (body.length > 2000)
      throw new Error("Comment must be 2000 characters or less");

    await ctx.db.insert("comments", {
      targetId: args.targetId,
      targetKind: args.targetKind,
      userId,
      body,
      createdAt: Date.now(),
    });

    // Increment stats.comments
    await ctx.db.patch(target._id, {
      stats: {
        ...(target as any).stats,
        comments: (target as any).stats.comments + 1,
      },
    });
  },
});

/**
 * Soft-delete a comment. Author or moderator/admin can delete.
 */
export const remove = mutation({
  args: {
    commentId: v.id("comments"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.softDeletedAt) throw new Error("Comment already deleted");

    const canModerate = await isModerator(ctx, userId);
    if (comment.userId !== userId && !canModerate) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.commentId, {
      softDeletedAt: Date.now(),
    });

    // Decrement stats.comments
    const target = await ctx.db.get(comment.targetId as any);
    if (target) {
      await ctx.db.patch(target._id, {
        stats: {
          ...(target as any).stats,
          comments: Math.max(0, (target as any).stats.comments - 1),
        },
      });
    }
  },
});
