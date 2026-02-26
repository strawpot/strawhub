import { v } from "convex/values";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

import { submitFileToVT, getVTAnalysis, VTRateLimitError } from "./lib/virusTotal";

const MAX_POLL_ATTEMPTS = 30; // ~30 minutes max wait

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

// ─── Internal Actions ────────────────────────────────────────────────────────

/**
 * Submit a skill version's zip archive to VirusTotal for scanning.
 * Marks as rate_limited if VT quota is exhausted.
 */
export const submitScan = internalAction({
  args: {
    versionId: v.id("skillVersions"),
    skillId: v.id("skills"),
    zipStorageId: v.optional(v.id("_storage")),
    zipFileName: v.string(),
  },
  handler: async (ctx, args) => {
    // No zip archive available
    if (!args.zipStorageId) {
      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "error",
        scanResult: { errorMessage: "No zip archive available for scanning" },
      });
      return;
    }

    // VT API key not configured — mark as rate_limited so moderator can retry later
    if (!process.env.VIRUSTOTAL_API_KEY) {
      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "rate_limited",
        scanResult: { errorMessage: "VIRUSTOTAL_API_KEY not configured" },
      });
      return;
    }

    // Read the zip from storage
    const zipBlob = await ctx.storage.get(args.zipStorageId);
    if (!zipBlob) {
      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "error",
        scanResult: { errorMessage: "Zip file not found in storage" },
      });
      return;
    }

    // Submit to VirusTotal
    try {
      const { analysisId } = await submitFileToVT(zipBlob, args.zipFileName);

      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "scanning",
        scanResult: { analysisId },
      });

      // Poll after 60 seconds
      await ctx.scheduler.runAfter(60_000, internal.virusTotalScan.pollResult, {
        versionId: args.versionId,
        skillId: args.skillId,
        analysisId,
        attemptNumber: 0,
      });
    } catch (error: any) {
      if (error instanceof VTRateLimitError) {
        await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
          versionId: args.versionId,
          scanStatus: "rate_limited",
          scanResult: { errorMessage: "VirusTotal API rate limit exceeded" },
        });
      } else {
        await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
          versionId: args.versionId,
          scanStatus: "error",
          scanResult: { errorMessage: error.message ?? "Unknown submission error" },
        });
      }
    }
  },
});

/**
 * Poll VirusTotal for analysis results. Reschedules itself if not yet done.
 */
export const pollResult = internalAction({
  args: {
    versionId: v.id("skillVersions"),
    skillId: v.id("skills"),
    analysisId: v.string(),
    attemptNumber: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.attemptNumber >= MAX_POLL_ATTEMPTS) {
      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "error",
        scanResult: {
          analysisId: args.analysisId,
          errorMessage: "Scan timed out after maximum poll attempts",
        },
      });
      return;
    }

    try {
      const result = await getVTAnalysis(args.analysisId);

      if (result.status === "queued") {
        // Not ready — reschedule with backoff (60s base, max 5 min)
        const delay = Math.min(60_000 * 1.5 ** args.attemptNumber, 300_000);
        await ctx.scheduler.runAfter(delay, internal.virusTotalScan.pollResult, {
          ...args,
          attemptNumber: args.attemptNumber + 1,
        });
        return;
      }

      // Scan completed
      const positives =
        (result.stats?.malicious ?? 0) + (result.stats?.suspicious ?? 0);
      const total = result.stats
        ? Object.values(result.stats).reduce((a, b) => a + b, 0)
        : 0;

      const scanResult = {
        analysisId: args.analysisId,
        positives,
        total,
        scanDate: Date.now(),
        permalink: result.permalink,
      };

      if (positives > 0) {
        await ctx.runMutation(internal.virusTotalScan.flagSkill, {
          skillId: args.skillId,
          versionId: args.versionId,
          scanResult,
        });
      } else {
        await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
          versionId: args.versionId,
          scanStatus: "clean",
          scanResult,
        });
      }
    } catch (error: any) {
      if (args.attemptNumber < MAX_POLL_ATTEMPTS - 1) {
        await ctx.scheduler.runAfter(
          60_000,
          internal.virusTotalScan.pollResult,
          { ...args, attemptNumber: args.attemptNumber + 1 },
        );
      } else {
        await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
          versionId: args.versionId,
          scanStatus: "error",
          scanResult: {
            analysisId: args.analysisId,
            errorMessage: error.message ?? "Poll error after max retries",
          },
        });
      }
    }
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

    await ctx.scheduler.runAfter(0, internal.virusTotalScan.submitScan, {
      versionId: args.versionId,
      skillId: version.skillId,
      zipStorageId: version.zipStorageId,
      zipFileName: `${skill.slug}-v${version.version}.zip`,
    });
  },
});
