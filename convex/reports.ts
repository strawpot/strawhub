import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Create a report on a skill or role.
 * One pending report per user per target.
 */
export const create = mutation({
  args: {
    targetId: v.string(),
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify target exists
    const target = await ctx.db.get(args.targetId as any);
    if (!target) throw new Error("Target not found");

    // Prevent self-reporting
    if ((target as any).ownerUserId === userId) {
      throw new Error("You cannot report your own content");
    }

    // Prevent duplicate pending reports from same user for same target
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_target_user", (q) =>
        q.eq("targetId", args.targetId).eq("userId", userId),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    if (existing) {
      throw new Error("You have already reported this item");
    }

    const description = args.description.trim();
    if (!description) {
      throw new Error("Description is required");
    }
    if (description.length > 1000) {
      throw new Error("Description must be 1000 characters or less");
    }

    await ctx.db.insert("reports", {
      targetId: args.targetId,
      targetKind: args.targetKind,
      userId,
      description,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/**
 * Check if the current user has a pending report on a target.
 */
export const hasReported = query({
  args: { targetId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const report = await ctx.db
      .query("reports")
      .withIndex("by_target_user", (q) =>
        q.eq("targetId", args.targetId).eq("userId", userId),
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    return !!report;
  },
});

/**
 * List reports by status. Admin/moderator only.
 */
export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("resolved"), v.literal("dismissed")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (user?.role !== "admin" && user?.role !== "moderator") {
      throw new Error("Not authorized");
    }

    const status = args.status ?? "pending";
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(100);

    return Promise.all(
      reports.map(async (report) => {
        const reporter = await ctx.db.get(report.userId);
        const target = await ctx.db.get(report.targetId as any);
        return {
          ...report,
          reporter: reporter
            ? { handle: reporter.handle, displayName: reporter.displayName }
            : null,
          targetName: target ? (target as any).displayName : "Unknown",
          targetSlug: target ? (target as any).slug : null,
        };
      }),
    );
  },
});

/**
 * Update a report's status. Admin/moderator only.
 */
export const resolve = mutation({
  args: {
    reportId: v.id("reports"),
    resolution: v.union(
      v.literal("pending"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (user?.role !== "admin" && user?.role !== "moderator") {
      throw new Error("Not authorized");
    }

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    if (report.status === args.resolution) return;

    const patch: Record<string, any> = { status: args.resolution };
    if (args.resolution === "pending") {
      patch.resolvedBy = undefined;
      patch.resolvedAt = undefined;
    } else {
      patch.resolvedBy = userId;
      patch.resolvedAt = Date.now();
    }

    await ctx.db.patch(args.reportId, patch);
  },
});
