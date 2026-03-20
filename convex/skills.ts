import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter, extractDependencies } from "./lib/frontmatter";
import { parseDependencySpec, parseVersion, compareVersions } from "./lib/versionSpec";
import { paginateWithRecovery } from "./lib/pagination";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateFiles, validateSkillFiles, validateFrontmatterName, resolveDisplayName } from "./lib/publishValidation";

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
 * List skills with cursor-based pagination, sorted by updatedAt/downloads/stars.
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
      // Use Convex search index for text search
      const matched = await ctx.db
        .query("skills")
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
          .query("skills")
          .withIndex(indexName, (q) => q.eq("softDeletedAt", undefined))
          .order("desc")
          .paginate(opts),
        args.paginationOpts,
      );
    }

    // Batch-fetch unique owners to avoid redundant reads
    const ownerIds = [...new Set(paginatedResult.page.map((s) => s.ownerUserId))];
    const ownerDocs = await Promise.all(ownerIds.map((id) => ctx.db.get(id)));
    const ownerMap = new Map(ownerIds.map((id, i) => [id, ownerDocs[i]]));

    // Batch-fetch latest versions to avoid N+1 queries
    const versionIds = [...new Set(
      paginatedResult.page
        .map((s) => s.latestVersionId)
        .filter((id): id is NonNullable<typeof id> => id != null),
    )];
    const versionDocs = await Promise.all(versionIds.map((id) => ctx.db.get(id)));
    const versionMap = new Map(versionIds.map((id, i) => [id, versionDocs[i]]));

    const enriched = paginatedResult.page.map((skill) => {
      const owner = ownerMap.get(skill.ownerUserId);
      const latestVersion = skill.latestVersionId
        ? versionMap.get(skill.latestVersionId) ?? null
        : null;
      return {
        _id: skill._id,
        slug: skill.slug,
        displayName: skill.displayName,
        summary: skill.summary,
        stats: skill.stats,
        badges: skill.badges,
        updatedAt: skill.updatedAt,
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
 * Get a skill by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill || skill.softDeletedAt) return null;

    let latestVersion = null;
    if (skill.latestVersionId) {
      latestVersion = await ctx.db.get(skill.latestVersionId);
    }

    const owner = await ctx.db.get(skill.ownerUserId);

    let dependencies: { skills: string[] } = { skills: [] };
    if (latestVersion?.dependencies) {
      dependencies = {
        skills: latestVersion.dependencies.skills ?? [],
      };
    }

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
      ...skill,
      latestVersion,
      dependencies,
      zipUrl,
      filesWithUrls,
      owner: owner ? { handle: owner.handle, displayName: owner.displayName, image: owner.image } : null,
    };
  },
});

/**
 * Get all versions of a skill.
 */
export const getVersions = query({
  args: { skillId: v.id("skills"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
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
 * Get a specific version of a skill.
 */
export const getVersion = query({
  args: {
    skillId: v.id("skills"),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skillVersions")
      .withIndex("by_skill_version", (q) =>
        q.eq("skillId", args.skillId).eq("version", args.version),
      )
      .first();
  },
});

/**
 * List skills owned by a user.
 */
export const listByOwner = query({
  args: { userId: v.id("users"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skills")
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
  dependencies: v.optional(
    v.object({
      skills: v.optional(v.array(v.string())),
    }),
  ),
  importSource: v.optional(
    v.object({
      source: v.string(),
      originalOwnerHandle: v.string(),
      originalOwnerGithubId: v.string(),
    }),
  ),
  customTags: v.optional(v.array(v.string())),
  skillMdText: v.optional(v.string()),
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
    validateFiles(args.files);
    validateSkillFiles(args.files);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    // Parse SKILL.md frontmatter (text passed by caller since mutations can't read blobs)
    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.skillMdText) {
      const { frontmatter } = parseFrontmatter(args.skillMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies) {
      dependencies = extractDependencies(parsed.frontmatter, "skill");
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      const errors: string[] = [];
      const notFound: string[] = [];
      const versionMismatch: string[] = [];
      let selfDep = false;
      for (const depSpec of dependencies.skills) {
        let spec;
        try { spec = parseDependencySpec(depSpec); } catch (e: any) {
          errors.push(`Invalid skill dependency: '${depSpec}'`);
          continue;
        }
        if (spec.operator === "wildcard") continue;
        if (spec.slug === args.slug) {
          selfDep = true;
          continue;
        }
        const depSkill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depSkill) {
          notFound.push(spec.slug);
          continue;
        }

        if (spec.operator === "==" && spec.version) {
          const exactMatch = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill_version", (q) =>
              q.eq("skillId", depSkill._id).eq("version", spec.version!),
            )
            .first();
          if (!exactMatch || exactMatch.softDeletedAt) {
            versionMismatch.push(`${spec.slug} (==${spec.version})`);
          }
        }
      }
      if (selfDep) errors.push("Skill cannot depend on itself");
      if (notFound.length > 0) errors.push(`Dependency skill(s) not found in registry: ${JSON.stringify(notFound)}`);
      if (versionMismatch.length > 0) errors.push(`No matching version for skill(s): ${JSON.stringify(versionMismatch)}`);
      if (errors.length > 0) throw new Error(errors.join(". "));
    }

    // Find or create skill
    let skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, skill?.displayName, args.slug);
    validateDisplayName(displayName);

    if (skill) {
      if (skill.ownerUserId !== user._id) {
        throw new Error("You do not own this skill");
      }
      if (skill.softDeletedAt) {
        throw new Error("Skill has been deleted");
      }
    } else {
      const skillId = await ctx.db.insert("skills", {
        slug: args.slug,
        displayName,
        summary: typeof parsed.frontmatter.description === "string"
          ? parsed.frontmatter.description
          : undefined,
        ownerUserId: user._id,
        tags: {},
        importSource: user.role === "admin" || user.role === "moderator" ? args.importSource : undefined,
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      skill = (await ctx.db.get(skillId))!;
      // Increment global skill counter
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "skills")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "skills", count: 1 }); }
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = skill.latestVersionId
      ? (await ctx.db.get(skill.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    // Check version uniqueness
    const existing = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill_version", (q) =>
        q.eq("skillId", skill!._id).eq("version", version),
      )
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

    // Create version
    const versionId = await ctx.db.insert("skillVersions", {
      skillId: skill._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      dependencies,
      createdBy: user._id,
      createdAt: now,
    });

    // Update skill: set latest, update tags, bump stats
    const currentTags = (skill.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) {
        currentTags[tag] = versionId;
      }
    }

    await ctx.db.patch(skill._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string"
        ? parsed.frontmatter.description
        : skill.summary,
      tags: currentTags,
      stats: { ...skill.stats, versions: skill.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitScan, {
      versionId,
      skillId: skill._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { skillId: skill._id, versionId };
  },
});

/**
 * Publish a new skill version (authenticated via Convex Auth session).
 */
export const publish = mutation({
  args: publishArgs,
  handler: async (ctx, args) => {
    validateSlug(args.slug);
    validateChangelog(args.changelog);
    validateFiles(args.files);
    validateSkillFiles(args.files);

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.skillMdText) {
      const { frontmatter } = parseFrontmatter(args.skillMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }
    validateFrontmatterName(parsed.frontmatter, args.slug);

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies) {
      dependencies = extractDependencies(parsed.frontmatter, "skill");
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      const errors: string[] = [];
      const notFound: string[] = [];
      const versionMismatch: string[] = [];
      let selfDep = false;
      for (const depSpec of dependencies.skills) {
        let spec;
        try { spec = parseDependencySpec(depSpec); } catch (e: any) {
          errors.push(`Invalid skill dependency: '${depSpec}'`);
          continue;
        }
        if (spec.operator === "wildcard") continue;
        if (spec.slug === args.slug) {
          selfDep = true;
          continue;
        }
        const depSkill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depSkill) {
          notFound.push(spec.slug);
          continue;
        }

        if (spec.operator === "==" && spec.version) {
          const exactMatch = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill_version", (q) =>
              q.eq("skillId", depSkill._id).eq("version", spec.version!),
            )
            .first();
          if (!exactMatch || exactMatch.softDeletedAt) {
            versionMismatch.push(`${spec.slug} (==${spec.version})`);
          }
        }
      }
      if (selfDep) errors.push("Skill cannot depend on itself");
      if (notFound.length > 0) errors.push(`Dependency skill(s) not found in registry: ${JSON.stringify(notFound)}`);
      if (versionMismatch.length > 0) errors.push(`No matching version for skill(s): ${JSON.stringify(versionMismatch)}`);
      if (errors.length > 0) throw new Error(errors.join(". "));
    }

    let skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    const displayName = resolveDisplayName(args.displayName, skill?.displayName, args.slug);
    validateDisplayName(displayName);

    if (skill) {
      if (skill.ownerUserId !== user._id) throw new Error("You do not own this skill");
      if (skill.softDeletedAt) throw new Error("Skill has been deleted");
    } else {
      const skillId = await ctx.db.insert("skills", {
        slug: args.slug,
        displayName,
        summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      skill = (await ctx.db.get(skillId))!;
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "skills")).first();
      if (counter) { await ctx.db.patch(counter._id, { count: counter.count + 1 }); }
      else { await ctx.db.insert("counters", { name: "skills", count: 1 }); }
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = skill.latestVersionId
      ? (await ctx.db.get(skill.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    const existing = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill_version", (q) => q.eq("skillId", skill!._id).eq("version", version))
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    const versionId = await ctx.db.insert("skillVersions", {
      skillId: skill._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
      parsed,
      dependencies,
      createdBy: user._id,
      createdAt: now,
    });

    const currentTags = (skill.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) currentTags[tag] = versionId;
    }

    await ctx.db.patch(skill._id, {
      latestVersionId: versionId,
      displayName,
      summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : skill.summary,
      tags: currentTags,
      stats: { ...skill.stats, versions: skill.stats.versions + 1 },
      updatedAt: now,
    });

    // Trigger VirusTotal scan
    await ctx.scheduler.runAfter(0, internal.virusTotalScanActions.submitScan, {
      versionId,
      skillId: skill._id,
      zipStorageId: args.zipStorageId,
      zipFileName: `${args.slug}-v${version}.zip`,
    });

    return { skillId: skill._id, versionId };
  },
});

/**
 * Soft-delete a skill via API token auth (moderator or admin only).
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

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");

    if (!skill.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "skills")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(skill._id, { softDeletedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Soft-delete a skill (admin only).
 */
export const softDelete = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");

    if (!skill.softDeletedAt) {
      const counter = await ctx.db.query("counters").withIndex("by_name", (q) => q.eq("name", "skills")).first();
      if (counter && counter.count > 0) { await ctx.db.patch(counter._id, { count: counter.count - 1 }); }
    }
    await ctx.db.patch(skill._id, { softDeletedAt: Date.now() });
  },
});

/**
 * Restore a soft-deleted skill (admin only).
 */
export const restore = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");

    await ctx.db.patch(skill._id, { softDeletedAt: undefined });
  },
});

/**
 * Claim ownership of an imported skill.
 * Verifies the caller's GitHub identity matches the original ClawHub owner.
 */
export const claimSkill = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");
    if (!skill.importSource) throw new Error("This skill was not imported and cannot be claimed");

    // Look up the caller's GitHub account ID from authAccounts
    const authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("provider"), "github"),
        ),
      )
      .first();
    if (!authAccount) throw new Error("No linked GitHub account found");

    if (authAccount.providerAccountId !== skill.importSource.originalOwnerGithubId) {
      throw new Error("Your GitHub identity does not match the original skill owner");
    }

    await ctx.db.patch(skill._id, {
      ownerUserId: userId,
      importSource: undefined,
      updatedAt: Date.now(),
    });

    return { ok: true, slug: args.slug };
  },
});

/**
 * Internal claim — accepts an explicit userId (used by HTTP endpoint).
 */
export const claimSkillInternal = internalMutation({
  args: { slug: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");
    if (!skill.importSource) throw new Error("This skill was not imported and cannot be claimed");

    const authAccount = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), args.userId),
          q.eq(q.field("provider"), "github"),
        ),
      )
      .first();
    if (!authAccount) throw new Error("No linked GitHub account found");

    if (authAccount.providerAccountId !== skill.importSource.originalOwnerGithubId) {
      throw new Error("Your GitHub identity does not match the original skill owner");
    }

    await ctx.db.patch(skill._id, {
      ownerUserId: args.userId,
      importSource: undefined,
      updatedAt: Date.now(),
    });

    return { ok: true, slug: args.slug };
  },
});
