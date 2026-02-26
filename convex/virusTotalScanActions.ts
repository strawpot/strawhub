import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { submitFileToVT, getVTAnalysis, VTRateLimitError } from "./lib/virusTotal";
import { isTextFile } from "./lib/textExtensions";
import { isBinaryByMagicBytes, containsNullBytes } from "./lib/binaryDetection";

const MAX_POLL_ATTEMPTS = 30; // ~30 minutes max wait

/**
 * Determine if all files in a version are text using three layers:
 *   1. Extension check (fast, no I/O)
 *   2. Magic bytes detection (needs file content)
 *   3. Null byte heuristic (needs file content)
 *
 * Returns true if ALL files are classified as text.
 */
async function areAllFilesText(
  ctx: { storage: { get: (id: string) => Promise<Blob | null> } },
  files: Array<{ path: string; storageId: string }>,
): Promise<boolean> {
  for (const file of files) {
    // Layer 1: reject files with unknown extensions immediately
    if (!isTextFile(file.path)) return false;

    // Layers 2 & 3: verify content even for known text extensions
    const blob = await ctx.storage.get(file.storageId);
    if (!blob) return false; // cannot read → assume binary for safety

    const buffer = new Uint8Array(await blob.arrayBuffer());

    // Layer 2: known binary format?
    if (isBinaryByMagicBytes(buffer)) return false;

    // Layer 3: null bytes in first 8 KiB?
    if (containsNullBytes(buffer, 8192)) return false;
  }

  return true;
}

/**
 * Submit a skill version's zip archive to VirusTotal for scanning.
 * Skips the scan when every file is detected as text.
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

    // ── Text-file detection: skip scan if all files are text ──
    const files = await ctx.runQuery(internal.virusTotalScan.getVersionFiles, {
      versionId: args.versionId,
    });

    if (files && files.length > 0 && await areAllFilesText(ctx, files)) {
      await ctx.runMutation(internal.virusTotalScan.setScanStatus, {
        versionId: args.versionId,
        scanStatus: "skipped",
        scanResult: {
          errorMessage: "All files are text-based; VirusTotal scan skipped",
        },
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
      await ctx.scheduler.runAfter(60_000, internal.virusTotalScanActions.pollResult, {
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
        await ctx.scheduler.runAfter(delay, internal.virusTotalScanActions.pollResult, {
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
          internal.virusTotalScanActions.pollResult,
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
