import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isModerator } from "./lib/access";

/**
 * List comments for a skill or role, newest first.
 */
export const list = query({
  args: {
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .order("desc")
      .collect();

    const userId = await getAuthUserId(ctx);
    const canModerate = userId ? await isModerator(ctx, userId) : false;

    return Promise.all(
      comments.map(async (comment) => {
        const deleted = !!comment.softDeletedAt;
        const user = await ctx.db.get(comment.userId);
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
      }),
    );
  },
});

/**
 * Add a comment to a skill or role.
 */
export const create = mutation({
  args: {
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role")),
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
