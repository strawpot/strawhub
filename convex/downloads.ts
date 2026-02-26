import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Track a download and increment both total stats and per-version counter.
 */
export const trackDownload = mutation({
  args: {
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    slug: v.string(),
    version: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.targetKind === "skill") {
      const skill = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (skill) {
        await ctx.db.patch(skill._id, {
          stats: { ...skill.stats, downloads: skill.stats.downloads + 1 },
        });
        // Increment per-version download count
        if (args.version) {
          const ver = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill_version", (q) =>
              q.eq("skillId", skill._id).eq("version", args.version!),
            )
            .first();
          if (ver) {
            await ctx.db.patch(ver._id, {
              downloads: (ver.downloads ?? 0) + 1,
            });
          }
        }
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
        if (args.version) {
          const ver = await ctx.db
            .query("roleVersions")
            .withIndex("by_role_version", (q) =>
              q.eq("roleId", role._id).eq("version", args.version!),
            )
            .first();
          if (ver) {
            await ctx.db.patch(ver._id, {
              downloads: (ver.downloads ?? 0) + 1,
            });
          }
        }
      }
    }
  },
});
