import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseDependencySpec, parseVersion, compareVersions, satisfiesVersion } from "./lib/versionSpec";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateFiles } from "./lib/publishValidation";

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
 * List skills with pagination, sorted by updatedAt.
 */
export const list = query({
  args: {
    query: v.optional(v.string()),
    sort: v.optional(v.union(
      v.literal("updated"),
      v.literal("downloads"),
      v.literal("stars"),
    )),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("skills")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .collect();
    const q = args.query?.toLowerCase();
    const matched = q
      ? all.filter(
          (s) =>
            s.displayName.toLowerCase().includes(q) ||
            s.slug.toLowerCase().includes(q) ||
            (s.summary ?? "").toLowerCase().includes(q),
        )
      : all;
    return Promise.all(
      matched.map(async (skill) => {
        const owner = await ctx.db.get(skill.ownerUserId);
        const latestVersion = skill.latestVersionId
          ? await ctx.db.get(skill.latestVersionId)
          : null;
        return {
          ...skill,
          latestVersionString: latestVersion?.version ?? null,
          totalSize: latestVersion?.files?.reduce((sum: number, f: { size: number }) => sum + f.size, 0) ?? 0,
          owner: owner ? { handle: owner.handle, image: owner.image } : null,
        };
      }),
    );
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
  args: { skillId: v.id("skills") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .collect();
    return Promise.all(
      versions.map(async (ver) => ({
        ...ver,
        zipUrl: ver.zipStorageId
          ? await ctx.storage.getUrl(ver.zipStorageId)
          : null,
      })),
    );
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
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", args.userId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .collect();
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

const publishArgs = {
  slug: v.string(),
  displayName: v.string(),
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
    validateDisplayName(args.displayName);
    validateChangelog(args.changelog);
    validateFiles(args.files);

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

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      const skills = (parsed.frontmatter.dependencies as string[])
        .map((d) => d.trim())
        .filter(Boolean);
      if (skills.length) {
        dependencies = { skills };
      }
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      const notFound: string[] = [];
      const versionMismatch: string[] = [];
      let selfDep = false;
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
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

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", depSkill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            versionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
      const errors: string[] = [];
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

    if (skill) {
      if (skill.ownerUserId !== user._id) {
        throw new Error("You do not own this skill");
      }
      if (skill.softDeletedAt) {
        throw new Error("Skill has been deleted");
      }
    } else {
      // Slug must be unique across both skills and roles
      const conflictingRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (conflictingRole && !conflictingRole.softDeletedAt) {
        throw new Error("This slug is already used by a role");
      }

      const skillId = await ctx.db.insert("skills", {
        slug: args.slug,
        displayName: args.displayName,
        summary: typeof parsed.frontmatter.description === "string"
          ? parsed.frontmatter.description
          : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      skill = (await ctx.db.get(skillId))!;
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
      displayName: args.displayName,
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
    validateDisplayName(args.displayName);
    validateChangelog(args.changelog);
    validateFiles(args.files);

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

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      const skills = (parsed.frontmatter.dependencies as string[])
        .map((d) => d.trim())
        .filter(Boolean);
      if (skills.length) {
        dependencies = { skills };
      }
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      const notFound: string[] = [];
      const versionMismatch: string[] = [];
      let selfDep = false;
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
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

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", depSkill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            versionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
      const errors: string[] = [];
      if (selfDep) errors.push("Skill cannot depend on itself");
      if (notFound.length > 0) errors.push(`Dependency skill(s) not found in registry: ${JSON.stringify(notFound)}`);
      if (versionMismatch.length > 0) errors.push(`No matching version for skill(s): ${JSON.stringify(versionMismatch)}`);
      if (errors.length > 0) throw new Error(errors.join(". "));
    }

    let skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (skill) {
      if (skill.ownerUserId !== user._id) throw new Error("You do not own this skill");
      if (skill.softDeletedAt) throw new Error("Skill has been deleted");
    } else {
      // Slug must be unique across both skills and roles
      const conflictingRole = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (conflictingRole && !conflictingRole.softDeletedAt) {
        throw new Error("This slug is already used by a role");
      }

      const skillId = await ctx.db.insert("skills", {
        slug: args.slug,
        displayName: args.displayName,
        summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      skill = (await ctx.db.get(skillId))!;
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
      displayName: args.displayName,
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
