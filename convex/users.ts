import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdmin } from "./lib/access";

/**
 * Get the current authenticated user.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db.get(userId);
  },
});

/**
 * Update the current user's profile.
 */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.patch(userId, {
      displayName: args.displayName?.trim() || undefined,
      bio: args.bio?.trim() || undefined,
    });
  },
});

/**
 * List users with pagination and optional search (admin-only).
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (!(await isAdmin(ctx, userId))) throw new Error("Not authorized");

    const search = args.search?.trim().toLowerCase();

    if (!search) {
      return await ctx.db.query("users").order("desc").paginate(args.paginationOpts);
    }

    // With search: collect, filter, return as a single complete page.
    const all = await ctx.db.query("users").order("desc").collect();
    const filtered = all.filter(
      (u) =>
        u.name?.toLowerCase().includes(search) ||
        u.handle?.toLowerCase().includes(search) ||
        u.displayName?.toLowerCase().includes(search) ||
        u.email?.toLowerCase().includes(search),
    );
    return {
      page: filtered,
      isDone: true,
      continueCursor: "" as any,
    };
  },
});

/**
 * Set a user's role (admin-only).
 */
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new Error("Not authenticated");
    if (!(await isAdmin(ctx, actorId))) throw new Error("Not authorized");
    if (actorId === args.userId) throw new Error("Cannot change your own role");

    await ctx.db.patch(args.userId, { role: args.role });
  },
});

/**
 * Block or unblock a user (admin-only).
 */
export const setBlocked = mutation({
  args: {
    userId: v.id("users"),
    blocked: v.boolean(),
    banReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new Error("Not authenticated");
    if (!(await isAdmin(ctx, actorId))) throw new Error("Not authorized");
    if (actorId === args.userId) throw new Error("Cannot block yourself");

    if (args.blocked) {
      await ctx.db.patch(args.userId, {
        deactivatedAt: Date.now(),
        banReason: args.banReason?.trim() || undefined,
      });
    } else {
      await ctx.db.patch(args.userId, {
        deactivatedAt: undefined,
        banReason: undefined,
      });
    }
  },
});

/**
 * Set a user's role via API token auth (admin only, by handle).
 */
export const setRoleInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    targetHandle: v.string(),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorUserId);
    if (!actor || actor.role !== "admin") throw new Error("Not authorized");

    const target = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.targetHandle))
      .first();
    if (!target) throw new Error("User not found");
    if (target._id === args.actorUserId) throw new Error("Cannot change your own role");

    await ctx.db.patch(target._id, { role: args.role });
    return { ok: true, handle: target.handle, role: args.role };
  },
});

/**
 * Block or unblock a user via API token auth (admin only, by handle).
 */
export const setBlockedInternal = internalMutation({
  args: {
    actorUserId: v.id("users"),
    targetHandle: v.string(),
    blocked: v.boolean(),
    banReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorUserId);
    if (!actor || actor.role !== "admin") throw new Error("Not authorized");

    const target = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.targetHandle))
      .first();
    if (!target) throw new Error("User not found");
    if (target._id === args.actorUserId) throw new Error("Cannot block yourself");

    if (args.blocked) {
      await ctx.db.patch(target._id, {
        deactivatedAt: Date.now(),
        banReason: args.banReason?.trim() || undefined,
      });
    } else {
      await ctx.db.patch(target._id, {
        deactivatedAt: undefined,
        banReason: undefined,
      });
    }
    return { ok: true, handle: target.handle, blocked: args.blocked };
  },
});

/**
 * Soft-delete the current user's account.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.patch(userId, { deactivatedAt: Date.now() });
  },
});
