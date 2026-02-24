import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseDependencySpec, satisfiesVersion } from "./lib/versionSpec";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * List skills with pagination, sorted by updatedAt.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    sort: v.optional(v.union(
      v.literal("updated"),
      v.literal("downloads"),
      v.literal("stars"),
    )),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .take(limit);
    return skills;
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

    return {
      ...skill,
      latestVersion,
      dependencies,
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
    return await ctx.db
      .query("skillVersions")
      .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .collect();
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
  version: v.string(),
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
};

/**
 * Internal publish — accepts an explicit userId (used by HTTP POST handlers).
 */
export const publishInternal = internalMutation({
  args: { ...publishArgs, userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    // Parse SKILL.md frontmatter from the uploaded files
    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    const skillMd = args.files.find((f) => f.path === "SKILL.md");
    if (skillMd) {
      const content = await ctx.storage.get(skillMd.storageId);
      if (content) {
        const text = await content.text();
        const { frontmatter } = parseFrontmatter(text);
        parsed = { frontmatter, metadata: frontmatter.metadata };
      }
    }

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      const skills = (parsed.frontmatter.dependencies as string[])
        .map((d) => d.trim())
        .filter((d) => d && !d.startsWith("role:"));
      if (skills.length) {
        dependencies = { skills };
      }
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          throw new Error(`Skill cannot depend on itself`);
        }
        const depSkill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depSkill) {
          throw new Error(`Dependency skill '${spec.slug}' not found in registry`);
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", depSkill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            throw new Error(
              `No version of skill '${spec.slug}' satisfies '${spec.operator}${spec.version}'`,
            );
          }
        }
      }
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

    // Check version uniqueness
    const existing = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill_version", (q) =>
        q.eq("skillId", skill!._id).eq("version", args.version),
      )
      .first();
    if (existing) throw new Error(`Version ${args.version} already exists`);

    // Create version
    const versionId = await ctx.db.insert("skillVersions", {
      skillId: skill._id,
      version: args.version,
      changelog: args.changelog,
      files: args.files,
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

    return { skillId: skill._id, versionId };
  },
});

/**
 * Publish a new skill version (authenticated via Convex Auth session).
 */
export const publish = mutation({
  args: publishArgs,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    const skillMd = args.files.find((f) => f.path === "SKILL.md");
    if (skillMd) {
      const content = await ctx.storage.get(skillMd.storageId);
      if (content) {
        const text = await content.text();
        const { frontmatter } = parseFrontmatter(text);
        parsed = { frontmatter, metadata: frontmatter.metadata };
      }
    }

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      const skills = (parsed.frontmatter.dependencies as string[])
        .map((d) => d.trim())
        .filter((d) => d && !d.startsWith("role:"));
      if (skills.length) {
        dependencies = { skills };
      }
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          throw new Error(`Skill cannot depend on itself`);
        }
        const depSkill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depSkill) {
          throw new Error(`Dependency skill '${spec.slug}' not found in registry`);
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", depSkill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            throw new Error(
              `No version of skill '${spec.slug}' satisfies '${spec.operator}${spec.version}'`,
            );
          }
        }
      }
    }

    let skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (skill) {
      if (skill.ownerUserId !== user._id) throw new Error("You do not own this skill");
      if (skill.softDeletedAt) throw new Error("Skill has been deleted");
    } else {
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

    const existing = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill_version", (q) => q.eq("skillId", skill!._id).eq("version", args.version))
      .first();
    if (existing) throw new Error(`Version ${args.version} already exists`);

    const versionId = await ctx.db.insert("skillVersions", {
      skillId: skill._id,
      version: args.version,
      changelog: args.changelog,
      files: args.files,
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

    return { skillId: skill._id, versionId };
  },
});

/**
 * Soft-delete a skill (owner, moderator, or admin).
 */
export const softDelete = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");

    const isOwner = skill.ownerUserId === user._id;
    const isMod = user.role === "moderator" || user.role === "admin";
    if (!isOwner && !isMod) throw new Error("Unauthorized");

    await ctx.db.patch(skill._id, { softDeletedAt: Date.now() });
  },
});

/**
 * Restore a soft-deleted skill.
 */
export const restore = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!skill) throw new Error("Skill not found");

    const isOwner = skill.ownerUserId === user._id;
    const isMod = user.role === "moderator" || user.role === "admin";
    if (!isOwner && !isMod) throw new Error("Unauthorized");

    await ctx.db.patch(skill._id, { softDeletedAt: undefined });
  },
});
