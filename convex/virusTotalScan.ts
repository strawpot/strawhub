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

/** Return the files array for an agent version (used by scan actions). */
export const getAgentVersionFiles = internalQuery({
  args: { versionId: v.id("agentVersions") },
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

export const setAgentScanStatus = internalMutation({
  args: {
    versionId: v.id("agentVersions"),
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

export const flagAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    versionId: v.id("agentVersions"),
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
    await ctx.db.patch(args.agentId, {
      moderationStatus: "hidden" as const,
    });
  },
});

// ─── Moderator Scan Queue ────────────────────────────────────────────────────

/**
 * List skill and agent versions that need scanning (rate_limited or error).
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

    // Collect rate_limited and error skill versions
    const skillRateLimited = await ctx.db
      .query("skillVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "rate_limited"))
      .collect();

    const skillErrored = await ctx.db
      .query("skillVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "error"))
      .collect();

    const skillVersions = [...skillRateLimited, ...skillErrored];

    // Enrich with skill info and priority
    const skillItems = await Promise.all(
      skillVersions
        .filter((ver) => !ver.softDeletedAt)
        .map(async (ver) => {
          const skill = await ctx.db.get(ver.skillId);
          if (!skill || skill.softDeletedAt) return null;

          const isLatest = skill.latestVersionId === ver._id;
          const owner = await ctx.db.get(skill.ownerUserId);

          return {
            _id: ver._id,
            kind: "skill" as const,
            parentId: ver.skillId,
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

    // Collect rate_limited and error agent versions
    const agentRateLimited = await ctx.db
      .query("agentVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "rate_limited"))
      .collect();

    const agentErrored = await ctx.db
      .query("agentVersions")
      .filter((q) => q.eq(q.field("scanStatus"), "error"))
      .collect();

    const agentVersions = [...agentRateLimited, ...agentErrored];

    const agentItems = await Promise.all(
      agentVersions
        .filter((ver) => !ver.softDeletedAt)
        .map(async (ver) => {
          const agent = await ctx.db.get(ver.agentId);
          if (!agent || agent.softDeletedAt) return null;

          const isLatest = agent.latestVersionId === ver._id;
          const owner = await ctx.db.get(agent.ownerUserId);

          return {
            _id: ver._id,
            kind: "agent" as const,
            parentId: ver.agentId,
            slug: agent.slug,
            displayName: agent.displayName,
            version: ver.version,
            scanStatus: ver.scanStatus as string,
            scanResult: ver.scanResult,
            priority: isLatest ? ("high" as const) : ("low" as const),
            owner: owner ? { handle: owner.handle, image: owner.image } : null,
            createdAt: ver.createdAt,
          };
        }),
    );

    const items = [...skillItems, ...agentItems];

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

/**
 * Retrigger a VirusTotal scan for an agent version.
 * Admin/moderator only. Only allowed for rate_limited or error versions.
 */
export const retriggerAgentScan = mutation({
  args: { versionId: v.id("agentVersions") },
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

    const agent = await ctx.db.get(version.agentId);
    if (!agent) throw new Error("Agent not found");

    await ctx.db.patch(args.versionId, {
      scanStatus: "pending",
      scanResult: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitAgentScan, {
      versionId: args.versionId,
      agentId: version.agentId,
      zipStorageId: version.zipStorageId,
      zipFileName: `${agent.slug}-v${version.version}.zip`,
    });
  },
});
