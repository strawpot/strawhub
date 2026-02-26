import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

const scanStatusLiterals = v.union(
  v.literal("pending"),
  v.literal("skipped"),
  v.literal("scanning"),
  v.literal("clean"),
  v.literal("flagged"),
  v.literal("error"),
  v.literal("rate_limited"),
);

const scanResultValidator = v.optional(
  v.object({
    analysisId: v.optional(v.string()),
    positives: v.optional(v.number()),
    total: v.optional(v.number()),
    scanDate: v.optional(v.number()),
    permalink: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }),
);

// ─── Internal Queries ───────────────────────────────────────────────────────

/** Return the files array for a skill version (used by scan actions). */
export const getVersionFiles = internalQuery({
  args: { versionId: v.id("skillVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;
    return (version.files ?? []) as Array<{
      path: string;
      size: number;
      storageId: string;
      sha256: string;
      contentType?: string;
    }>;
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────────────

export const setScanStatus = internalMutation({
  args: {
    versionId: v.id("skillVersions"),
    scanStatus: scanStatusLiterals,
    scanResult: scanResultValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.versionId, {
      scanStatus: args.scanStatus,
      scanResult: args.scanResult,
    });
  },
});

export const flagSkill = internalMutation({
  args: {
    skillId: v.id("skills"),
    versionId: v.id("skillVersions"),
    scanResult: v.object({
      analysisId: v.optional(v.string()),
      positives: v.optional(v.number()),
      total: v.optional(v.number()),
      scanDate: v.optional(v.number()),
      permalink: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.versionId, {
      scanStatus: "flagged" as const,
      scanResult: args.scanResult,
    });
    await ctx.db.patch(args.skillId, {
      moderationStatus: "hidden" as const,
    });
  },
});

// ─── Moderator Scan Queue ────────────────────────────────────────────────────

/**
 * List skill versions that need scanning (rate_limited or error).
 * Returns items sorted by priority: high = latest version, low = superseded.
 * Admin/moderator only.
 */
export const listPendingScans = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (user?.role !== "admin" && user?.role !== "moderator") {
      throw new Error("Not authorized");
    }

    // Collect rate_limited and error versions
    const rateLimited = await ctx.db
      .query("skillVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "rate_limited"))
      .collect();

    const errored = await ctx.db
      .query("skillVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "error"))
      .collect();

    const versions = [...rateLimited, ...errored];

    // Enrich with skill info and priority
    const items = await Promise.all(
      versions
        .filter((ver) => !ver.softDeletedAt)
        .map(async (ver) => {
          const skill = await ctx.db.get(ver.skillId);
          if (!skill || skill.softDeletedAt) return null;

          const isLatest = skill.latestVersionId === ver._id;
          const owner = await ctx.db.get(skill.ownerUserId);

          return {
            _id: ver._id,
            skillId: ver.skillId,
            slug: skill.slug,
            displayName: skill.displayName,
            version: ver.version,
            scanStatus: ver.scanStatus as string,
            scanResult: ver.scanResult,
            priority: isLatest ? ("high" as const) : ("low" as const),
            owner: owner ? { handle: owner.handle, image: owner.image } : null,
            createdAt: ver.createdAt,
          };
        }),
    );

    // Filter nulls, sort: high priority first, then by creation date desc
    return items
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  },
});

/**
 * Retrigger a VirusTotal scan for a skill version.
 * Admin/moderator only. Only allowed for rate_limited or error versions.
 */
export const retriggerScan = mutation({
  args: { versionId: v.id("skillVersions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (user?.role !== "admin" && user?.role !== "moderator") {
      throw new Error("Not authorized");
    }

    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");

    if (version.scanStatus !== "rate_limited" && version.scanStatus !== "error") {
      throw new Error("Can only retrigger scans for rate_limited or errored versions");
    }

    const skill = await ctx.db.get(version.skillId);
    if (!skill) throw new Error("Skill not found");

    // Reset to pending and schedule a new scan
    await ctx.db.patch(args.versionId, {
      scanStatus: "pending",
      scanResult: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitScan, {
      versionId: args.versionId,
      skillId: version.skillId,
      zipStorageId: version.zipStorageId,
      zipFileName: `${skill.slug}-v${version.version}.zip`,
    });
  },
});
