import { v } from "convex/values";
import { query, internalMutation, mutation } from "./_generated/server";

/**
 * Increment or decrement a named counter.
 * Creates the counter row if it doesn't exist yet.
 */
export const adjust = internalMutation({
  args: {
    name: v.string(),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: Math.max(0, existing.count + args.delta),
      });
    } else {
      await ctx.db.insert("counters", {
        name: args.name,
        count: Math.max(0, args.delta),
      });
    }
  },
});

export const backfill = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = ["skills", "roles", "agents"] as const;
    const results: Record<string, number> = {};
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      const count = rows.filter((r: any) => !r.softDeletedAt).length;
      const existing = await ctx.db
        .query("counters")
        .withIndex("by_name", (q) => q.eq("name", table))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { count });
      } else {
        await ctx.db.insert("counters", { name: table, count });
      }
      results[table] = count;
    }
    return results;
  },
});

/**
 * Get counts for all resource types.
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("counters").collect();
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.name] = row.count;
    }
    return result;
  },
});
