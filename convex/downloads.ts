import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Track a download and increment stats.
 */
export const trackDownload = mutation({
  args: {
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.targetKind === "skill") {
      const skill = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (skill) {
        await ctx.db.patch(skill._id, {
          stats: { ...skill.stats, downloads: skill.stats.downloads + 1 },
        });
      }
    } else {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (role) {
        await ctx.db.patch(role._id, {
          stats: { ...role.stats, downloads: role.stats.downloads + 1 },
        });
      }
    }
  },
});
