import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Track a download by inserting a lightweight stat event.
 * A cron job (every 15 min) flushes accumulated events into the target
 * document's stats, preventing thundering-herd query invalidation on
 * popular items.
 *
 * Authenticated downloads are deduplicated per user+target+version:
 * only the first download of a given version by a given user is counted.
 * Anonymous downloads are always counted (like npm/PyPI).
 */
export const trackDownload = mutation({
  args: {
    targetKind: v.union(v.literal("skill"), v.literal("role"), v.literal("agent"), v.literal("memory"), v.literal("integration")),
    slug: v.string(),
    version: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const table = args.targetKind === "skill" ? "skills"
      : args.targetKind === "role" ? "roles"
      : args.targetKind === "memory" ? "memories"
      : "agents";
    const target = await ctx.db
      .query(table)
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .first();
    if (!target) return { found: false };

    // Resolve version ID if provided
    let versionId: string | undefined;
    if (args.version) {
      if (args.targetKind === "skill") {
        const ver = await ctx.db
          .query("skillVersions")
          .withIndex("by_skill_version", (q) =>
            q.eq("skillId", target._id as any).eq("version", args.version!),
          )
          .first();
        versionId = ver?._id;
      } else if (args.targetKind === "role") {
        const ver = await ctx.db
          .query("roleVersions")
          .withIndex("by_role_version", (q) =>
            q.eq("roleId", target._id as any).eq("version", args.version!),
          )
          .first();
        versionId = ver?._id;
      } else if (args.targetKind === "memory") {
        const ver = await ctx.db
          .query("memoryVersions")
          .withIndex("by_memory_version", (q) =>
            q.eq("memoryId", target._id as any).eq("version", args.version!),
          )
          .first();
        versionId = ver?._id;
      } else {
        const ver = await ctx.db
          .query("agentVersions")
          .withIndex("by_agent_version", (q) =>
            q.eq("agentId", target._id as any).eq("version", args.version!),
          )
          .first();
        versionId = ver?._id;
      }
    }

    // Deduplicate: skip if this user already downloaded this target+version
    if (args.userId) {
      const existing = await ctx.db
        .query("statEvents")
        .withIndex("by_user_target_version", (q) =>
          q
            .eq("userId", args.userId!)
            .eq("targetId", target._id)
            .eq("versionId", versionId),
        )
        .first();
      if (existing) return { found: true };
    }

    await ctx.db.insert("statEvents", {
      targetKind: args.targetKind,
      targetId: target._id,
      event: "download",
      versionId,
      userId: args.userId,
      createdAt: Date.now(),
    });
    return { found: true };
  },
});
