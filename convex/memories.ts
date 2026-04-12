import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseVersion, compareVersions } from "./lib/versionSpec";
import { paginateWithRecovery } from "./lib/pagination";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateMemoryFiles, validateFrontmatterName, resolveDisplayName } from "./lib/publishValidation";

/** Resolve version: validate if provided, otherwise auto-increment from latest. */
function resolveVersion(explicit: string | undefined, latestVersion: string | undefined): string {
  if (explicit) {
    validateVersion(explicit);
    return explicit;
  }
  if (!latestVersion) return "1.0.0";
  const { major, minor, patch } = parseVersion(latestVersion);
  return `${major}.${minor}.${patch + 1}`;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * List memories with cursor-based pagination, sorted by updatedAt/downloads/stars.
 * When a text query is provided, falls back to .take() with a single-page result.
 */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    query: v.optional(v.string()),
    sort: v.optional(v.union(
      v.literal("updated"),
      v.literal("downloads"),
      v.literal("stars"),
    )),
  },
  handler: async (ctx, args) => {
    const sort = args.sort ?? "updated";
    const indexName = sort === "downloads" ? "by_active_stats_downloads"
      : sort === "stars" ? "by_active_stats_stars"
      : "by_active_updated";

    const q = args.query?.toLowerCase();

    let paginatedResult;
    if (q) {
      const matched = await ctx.db
        .query("memories")
        .withSearchIndex("search", (search) =>
          search.search("displayName", q).eq("softDeletedAt", undefined),
        )
        .take(args.paginationOpts.numItems);
      paginatedResult = {
        page: matched,
        isDone: true,
        continueCursor: "" as any,
      };
    } else {
      paginatedResult = await paginateWithRecovery(
        (opts) => ctx.db
          .query("memories")
          .withIndex(indexName, (q) => q.eq("softDeletedAt", undefined))
          .order("desc")
          .paginate(opts),
        args.paginationOpts,
      );
    }

    // Batch-fetch unique owners to avoid redundant reads
    const ownerIds = [...new Set(paginatedResult.page.map((m) => m.ownerUserId))];
    const ownerDocs = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const ownerMap = new Map(ownerIds.map((id, i) => [id, ownerDocs[i]]));

    // Batch-fetch latest versions to avoid N+1 queries
    const versionIds = [...new Set(
      paginatedResult.page
        .map((m) => m.latestVersionId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    )];
    const versionDocs = await Promise.all(versionIds.map((id) => ctx.db.get(id)));
    const versionMap = new Map(versionIds.map((id, i) => [id, versionDocs[i]]));

    const enriched = paginatedResult.page.map((memory) => {
      const owner = ownerMap.get(memory.ownerUserId);
      const latestVersion = memory.latestVersionId
        ? versionMap.get(memory.latestVersionId) ?? null
        : null;
      return {
        _id: memory._id,
        slug: memory.slug,
        displayName: memory.displayName,
        summary: memory.summary,
        stats: memory.stats,
        badges: memory.badges,
        updatedAt: memory.updatedAt,
        latestVersionString: latestVersion?.version ?? null,
        totalSize: latestVersion?.files?.reduce((sum: number, f: { size: number }) => sum + f.size, 0) ?? 0,
        owner: owner ? { handle: owner.handle, image: owner.image } : null,
      };
    });

    return {
      ...paginatedResult,
      page: enriched,
    };
  },
});

/**
 * Get a memory by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!memory || memory.softDeletedAt) return null;

    let latestVersion = null;
    if (memory.latestVersionId) {
      latestVersion = await ctx.db.get(memory.latestVersionId);
    }

    const owner = await ctx.db.get(memory.ownerUserId);

    let zipUrl: string | null = null;
    if (latestVersion?.zipStorageId) {
      zipUrl = await ctx.storage.getUrl(latestVersion.zipStorageId);
    }

    // Resolve file storage URLs for the file viewer
    let filesWithUrls: Array<{ path: string; size: number; url: string | null }> = [];
    if (latestVersion?.files) {
      filesWithUrls = await Promise.all(
        latestVersion.files.map(async (f: { path: string; size: number; storageId: any }) => ({
          path: f.path,
          size: f.size,
          url: await ctx.storage.getUrl(f.storageId),
        })),
      );
    }

    return {
      ...memory,
      latestVersion,
      zipUrl,
      filesWithUrls,
      owner: owner ? { handle: owner.handle, displayName: owner.displayName, image: owner.image } : null,
    };
  },
});

/**
 * Get all versions of a memory.
 */
export const getVersions = query({
  args: { memoryId: v.id("memories"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("memoryVersions")
      .withIndex("by_memory", (q) => q.eq("memoryId", args.memoryId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
    const enriched = await Promise.all(
      result.page.map(async (ver) => ({
        ...ver,
        zipUrl: ver.zipStorageId
          ? await ctx.storage.getUrl(ver.zipStorageId)
          : null,
      })),
    );
    return { ...result, page: enriched };
  },
});

/**
 * List memories owned by a user.
 */
export const listByOwner = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memories")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", args.userId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .paginate(args.paginationOpts);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

const publishArgs = {
  slug: v.string(),
  displayName: v.optional(v.string()),
  version: v.optional(v.string()),
  changelog: v.string(),
  files: v.array(
    v.object({
      path: v.string(),
      size: v.number(),
      storageId: v.id("_storage"),
      sha256: v.string(),
      contentType: v.optional(v.string()),
    }),
  ),
  customTags: v.optional(v.array(v.string())),
  memoryMdText: v.optional(v.string()),
  zipStorageId: v.optional(v.id("_storage")),
};

/**
 * Internal publish — accepts an explicit userId (used by HTTP POST handlers).
 */
export const publishInternal = internalMutation({
  args: { ...publishArgs, userId: v.id("users") },
  handler: async (ctx, args) => {
    validateSlug(args.slug);
    validateChangelog(args.changelog);
    validateMemoryFiles(args.files);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.memoryMdText) {
      const { frontmatter } = parseFrontmatter(args.memoryMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    let memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, memory?.displayName, args.slug);
    validateDisplayName(displayName);

    if (memory) {
      if (memory.ownerUserId !== user._id) throw new Error("You do not own this memory");
      if (memory.softDeletedAt) throw new Error("Memory has been deleted");
    } else {
      const memoryId = await ctx.db.insert("memories", {
        slug: args.slug,
        displayName,
        summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      memory = (await ctx.db.get(memoryId))!;
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "memories")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "memories", count: 1 }); }
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = memory.latestVersionId
      ? (await ctx.db.get(memory.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    const existing = await ctx.db
      .query("memoryVersions")
      .withIndex("by_memory_version", (q) => q.eq("memoryId", memory!._id).eq("version", version))
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    // Check version is greater than latest
    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new Error(
          `Version ${version} must be greater than the latest version ${latestVer}`,
        );
      }
    }

    const versionId = await ctx.db.insert("memoryVersions", {
      memoryId: memory._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      createdBy: user._id,
      createdAt: now,
    });

    const currentTags = (memory.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) currentTags[tag] = versionId;
    }

    await ctx.db.patch(memory._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : memory.summary,
      tags: currentTags,
      stats: { ...memory.stats, versions: memory.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitMemoryScan, {
      versionId,
      memoryId: memory._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { memoryId: memory._id, versionId };
  },
});

/**
 * Publish a new memory version (authenticated via Convex Auth session).
 */
export const publish = mutation({
  args: publishArgs,
  handler: async (ctx, args) => {
    validateSlug(args.slug);
    validateChangelog(args.changelog);
    validateMemoryFiles(args.files);

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");
    if (user.deactivatedAt) throw new ConvexError("Account is deactivated");

    const now = Date.now();

    // Parse MEMORY.md frontmatter
    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.memoryMdText) {
      const { frontmatter } = parseFrontmatter(args.memoryMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    // Find or create memory
    let memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, memory?.displayName, args.slug);
    validateDisplayName(displayName);

    if (memory) {
      if (memory.ownerUserId !== user._id) {
        throw new ConvexError("You do not own this memory");
      }
      if (memory.softDeletedAt) {
        throw new ConvexError("Memory has been deleted");
      }
    } else {
      const memoryId = await ctx.db.insert("memories", {
        slug: args.slug,
        displayName,
        summary: typeof parsed.frontmatter.description === "string"
          ? parsed.frontmatter.description
          : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      memory = (await ctx.db.get(memoryId))!;
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "memories")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "memories", count: 1 }); }
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = memory.latestVersionId
      ? (await ctx.db.get(memory.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    // Check version uniqueness
    const existing = await ctx.db
      .query("memoryVersions")
      .withIndex("by_memory_version", (q) =>
        q.eq("memoryId", memory!._id).eq("version", version),
      )
      .first();
    if (existing) throw new ConvexError(`Version ${version} already exists for memory '${args.slug}'`);

    // Check version is greater than latest
    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new ConvexError(
          `Version ${version} must be greater than the latest version ${latestVer} for memory '${args.slug}'`,
        );
      }
    }

    // Create version
    const versionId = await ctx.db.insert("memoryVersions", {
      memoryId: memory._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      createdBy: user._id,
      createdAt: now,
    });

    // Update memory
    const currentTags = (memory.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) {
        currentTags[tag] = versionId;
      }
    }

    await ctx.db.patch(memory._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string"
        ? parsed.frontmatter.description
        : memory.summary,
      tags: currentTags,
      stats: { ...memory.stats, versions: memory.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitMemoryScan, {
      versionId,
      memoryId: memory._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { memoryId: memory._id, versionId };
  },
});

/**
 * Soft-delete a memory via API token auth (moderator or admin only).
 */
export const softDeleteInternal = internalMutation({
  args: {
    slug: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    if (user.role !== "admin" && user.role !== "moderator") {
      throw new Error("Unauthorized: must be moderator or admin");
    }

    const memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!memory) throw new Error("Memory not found");

    if (!memory.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "memories")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(memory._id, { softDeletedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Soft-delete a memory (admin only).
 */
export const softDelete = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!memory) throw new Error("Memory not found");

    if (!memory.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "memories")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(memory._id, { softDeletedAt: Date.now() });
  },
});

/**
 * Restore a soft-deleted memory (admin only).
 */
export const restore = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const memory = await ctx.db
      .query("memories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!memory) throw new Error("Memory not found");

    await ctx.db.patch(memory._id, { softDeletedAt: undefined });
  },
});
