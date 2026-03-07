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

/** Return the files array for a memory version (used by scan actions). */
export const getMemoryVersionFiles = internalQuery({
  args: { versionId: v.id("memoryVersions") },
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

export const setMemoryScanStatus = internalMutation({
  args: {
    versionId: v.id("memoryVersions"),
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

export const flagMemory = internalMutation({
  args: {
    memoryId: v.id("memories"),
    versionId: v.id("memoryVersions"),
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
    await ctx.db.patch(args.memoryId, {
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

    // Collect rate_limited and error skill versions using index
    const skillRateLimited = await ctx.db
      .query("skillVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "rate_limited"))
      .take(20);

    const skillErrored = await ctx.db
      .query("skillVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "error"))
      .take(20);

    const skillVersions = [...skillRateLimited, ...skillErrored]
      .filter((ver) => !ver.softDeletedAt);

    // Batch-fetch parent skills to avoid N+1
    const skillDocs = await Promise.all(
      skillVersions.map((ver) => ctx.db.get(ver.skillId)),
    );

    const skillItems = skillVersions.map((ver, i) => {
      const skill = skillDocs[i];
      if (!skill || skill.softDeletedAt) return null;

      const isLatest = skill.latestVersionId === ver._id;
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
        createdAt: ver.createdAt,
      };
    });

    // Collect rate_limited and error agent versions using index
    const agentRateLimited = await ctx.db
      .query("agentVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "rate_limited"))
      .take(20);

    const agentErrored = await ctx.db
      .query("agentVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "error"))
      .take(20);

    const agentVersions = [...agentRateLimited, ...agentErrored]
      .filter((ver) => !ver.softDeletedAt);

    // Batch-fetch parent agents to avoid N+1
    const agentDocs = await Promise.all(
      agentVersions.map((ver) => ctx.db.get(ver.agentId)),
    );

    const agentItems = agentVersions.map((ver, i) => {
      const agent = agentDocs[i];
      if (!agent || agent.softDeletedAt) return null;

      const isLatest = agent.latestVersionId === ver._id;
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
        createdAt: ver.createdAt,
      };
    });

    // Collect rate_limited and error memory versions using index
    const memoryRateLimited = await ctx.db
      .query("memoryVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "rate_limited"))
      .take(20);

    const memoryErrored = await ctx.db
      .query("memoryVersions")
      .withIndex("by_scanStatus", (q) => q.eq("scanStatus", "error"))
      .take(20);

    const memoryVersions = [...memoryRateLimited, ...memoryErrored]
      .filter((ver) => !ver.softDeletedAt);

    // Batch-fetch parent memories to avoid N+1
    const memoryDocs = await Promise.all(
      memoryVersions.map((ver) => ctx.db.get(ver.memoryId)),
    );

    const memoryItems = memoryVersions.map((ver, i) => {
      const mem = memoryDocs[i];
      if (!mem || mem.softDeletedAt) return null;

      const isLatest = mem.latestVersionId === ver._id;
      return {
        _id: ver._id,
        kind: "memory" as const,
        parentId: ver.memoryId,
        slug: mem.slug,
        displayName: mem.displayName,
        version: ver.version,
        scanStatus: ver.scanStatus as string,
        scanResult: ver.scanResult,
        priority: isLatest ? ("high" as const) : ("low" as const),
        createdAt: ver.createdAt,
      };
    });

    const items = [...skillItems, ...agentItems, ...memoryItems];

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

/**
 * Retrigger a VirusTotal scan for a memory version.
 * Admin/moderator only. Only allowed for rate_limited or error versions.
 */
export const retriggerMemoryScan = mutation({
  args: { versionId: v.id("memoryVersions") },
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

    const memory = await ctx.db.get(version.memoryId);
    if (!memory) throw new Error("Memory not found");

    await ctx.db.patch(args.versionId, {
      scanStatus: "pending",
      scanResult: undefined,
    });

    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitMemoryScan, {
      versionId: args.versionId,
      memoryId: version.memoryId,
      zipStorageId: version.zipStorageId,
      zipFileName: `${memory.slug}-v${version.version}.zip`,
    });
  },
});
