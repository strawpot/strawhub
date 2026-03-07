import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Track a download by inserting a lightweight stat event.
 * A cron job (every 15 min) flushes accumulated events into the target
 * document's stats, preventing thundering-herd query invalidation on
 * popular items.
 */
export const trackDownload = mutation({
  args: {
    targetKind: v.union(v.literal("skill"), v.literal("role"), v.literal("agent"), v.literal("memory")),
    slug: v.string(),
    version: v.optional(v.string()),
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
    if (!target) return;

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

    await ctx.db.insert("statEvents", {
      targetKind: args.targetKind,
      targetId: target._id,
      event: "download",
      versionId,
      createdAt: Date.now(),
    });
  },
});
