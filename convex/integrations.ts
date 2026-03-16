import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseVersion, compareVersions } from "./lib/versionSpec";
import { paginateWithRecovery } from "./lib/pagination";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateIntegrationFiles, validateFrontmatterName, resolveDisplayName } from "./lib/publishValidation";

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
 * List integrations with cursor-based pagination, sorted by updatedAt/downloads/stars.
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
        .query("integrations")
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
          .query("integrations")
          .withIndex(indexName, (q) => q.eq("softDeletedAt", undefined))
          .order("desc")
          .paginate(opts),
        args.paginationOpts,
      );
    }

    // Batch-fetch unique owners
    const ownerIds = [...new Set(paginatedResult.page.map((a) => a.ownerUserId))];
    const ownerDocs = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const ownerMap = new Map(ownerIds.map((id, i) => [id, ownerDocs[i]]));

    // Batch-fetch latest versions
    const versionIds = [...new Set(
      paginatedResult.page
        .map((a) => a.latestVersionId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    )];
    const versionDocs = await Promise.all(versionIds.map((id) => ctx.db.get(id)));
    const versionMap = new Map(versionIds.map((id, i) => [id, versionDocs[i]]));

    const enriched = paginatedResult.page.map((integration) => {
      const owner = ownerMap.get(integration.ownerUserId);
      const latestVersion = integration.latestVersionId
        ? versionMap.get(integration.latestVersionId) ?? null
        : null;
      return {
        _id: integration._id,
        slug: integration.slug,
        displayName: integration.displayName,
        summary: integration.summary,
        stats: integration.stats,
        badges: integration.badges,
        updatedAt: integration.updatedAt,
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
 * Get an integration by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!integration || integration.softDeletedAt) return null;

    let latestVersion = null;
    if (integration.latestVersionId) {
      latestVersion = await ctx.db.get(integration.latestVersionId);
    }

    const owner = await ctx.db.get(integration.ownerUserId);

    let zipUrl: string | null = null;
    if (latestVersion?.zipStorageId) {
      zipUrl = await ctx.storage.getUrl(latestVersion.zipStorageId);
    }

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
      ...integration,
      latestVersion,
      zipUrl,
      filesWithUrls,
      owner: owner ? { handle: owner.handle, displayName: owner.displayName, image: owner.image } : null,
    };
  },
});

/**
 * Get all versions of an integration.
 */
export const getVersions = query({
  args: { integrationId: v.id("integrations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("integrationVersions")
      .withIndex("by_integration", (q) => q.eq("integrationId", args.integrationId))
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
 * List integrations owned by a user.
 */
export const listByOwner = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("integrations")
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
  integrationMdText: v.optional(v.string()),
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
    validateIntegrationFiles(args.files);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.integrationMdText) {
      const { frontmatter } = parseFrontmatter(args.integrationMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    let integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, integration?.displayName, args.slug);
    validateDisplayName(displayName);

    if (integration) {
      if (integration.ownerUserId !== user._id) throw new Error("You do not own this integration");
      if (integration.softDeletedAt) throw new Error("Integration has been deleted");
    } else {
      const integrationId = await ctx.db.insert("integrations", {
        slug: args.slug,
        displayName,
        summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      integration = (await ctx.db.get(integrationId))!;
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "integrations")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "integrations", count: 1 }); }
    }

    // Resolve version
    const latestVer = integration.latestVersionId
      ? (await ctx.db.get(integration.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    const existing = await ctx.db
      .query("integrationVersions")
      .withIndex("by_integration_version", (q) => q.eq("integrationId", integration!._id).eq("version", version))
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new Error(
          `Version ${version} must be greater than the latest version ${latestVer}`,
        );
      }
    }

    const versionId = await ctx.db.insert("integrationVersions", {
      integrationId: integration._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      createdBy: user._id,
      createdAt: now,
    });

    const currentTags = (integration.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) currentTags[tag] = versionId;
    }

    await ctx.db.patch(integration._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : integration.summary,
      tags: currentTags,
      stats: { ...integration.stats, versions: integration.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitIntegrationScan, {
      versionId,
      integrationId: integration._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { integrationId: integration._id, versionId };
  },
});

/**
 * Publish a new integration version (authenticated via Convex Auth session).
 */
export const publish = mutation({
  args: publishArgs,
  handler: async (ctx, args) => {
    validateSlug(args.slug);
    validateChangelog(args.changelog);
    validateIntegrationFiles(args.files);

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.integrationMdText) {
      const { frontmatter } = parseFrontmatter(args.integrationMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    let integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, integration?.displayName, args.slug);
    validateDisplayName(displayName);

    if (integration) {
      if (integration.ownerUserId !== user._id) {
        throw new Error("You do not own this integration");
      }
      if (integration.softDeletedAt) {
        throw new Error("Integration has been deleted");
      }
    } else {
      const integrationId = await ctx.db.insert("integrations", {
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
      integration = (await ctx.db.get(integrationId))!;
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "integrations")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "integrations", count: 1 }); }
    }

    const latestVer = integration.latestVersionId
      ? (await ctx.db.get(integration.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    const existing = await ctx.db
      .query("integrationVersions")
      .withIndex("by_integration_version", (q) =>
        q.eq("integrationId", integration!._id).eq("version", version),
      )
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new Error(
          `Version ${version} must be greater than the latest version ${latestVer}`,
        );
      }
    }

    const versionId = await ctx.db.insert("integrationVersions", {
      integrationId: integration._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      createdBy: user._id,
      createdAt: now,
    });

    const currentTags = (integration.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) {
        currentTags[tag] = versionId;
      }
    }

    await ctx.db.patch(integration._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string"
        ? parsed.frontmatter.description
        : integration.summary,
      tags: currentTags,
      stats: { ...integration.stats, versions: integration.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitIntegrationScan, {
      versionId,
      integrationId: integration._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { integrationId: integration._id, versionId };
  },
});

/**
 * Soft-delete an integration via API token auth (moderator or admin only).
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

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!integration) throw new Error("Integration not found");

    if (!integration.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "integrations")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(integration._id, { softDeletedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Soft-delete an integration (admin only).
 */
export const softDelete = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!integration) throw new Error("Integration not found");

    if (!integration.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "integrations")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(integration._id, { softDeletedAt: Date.now() });
  },
});

/**
 * Restore a soft-deleted integration (admin only).
 */
export const restore = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!integration) throw new Error("Integration not found");

    await ctx.db.patch(integration._id, { softDeletedAt: undefined });
  },
});
