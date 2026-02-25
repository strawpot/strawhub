import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseDependencySpec, parseVersion, satisfiesVersion, splitDependencies } from "./lib/versionSpec";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateFiles, validateRoleFiles } from "./lib/publishValidation";

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
 * List roles with pagination.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
    sort: v.optional(v.union(
      v.literal("updated"),
      v.literal("downloads"),
      v.literal("stars"),
    )),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    return await ctx.db
      .query("roles")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get a role by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!role || role.softDeletedAt) return null;

    let latestVersion = null;
    if (role.latestVersionId) {
      latestVersion = await ctx.db.get(role.latestVersionId);
    }

    const owner = await ctx.db.get(role.ownerUserId);

    let dependencies: { skills: string[]; roles: string[] } = { skills: [], roles: [] };
    if (latestVersion?.dependencies) {
      dependencies = {
        skills: latestVersion.dependencies.skills ?? [],
        roles: latestVersion.dependencies.roles ?? [],
      };
    }

    return {
      ...role,
      latestVersion,
      dependencies,
      owner: owner ? { handle: owner.handle, displayName: owner.displayName, image: owner.image } : null,
    };
  },
});

/**
 * Get all versions of a role.
 */
export const getVersions = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roleVersions")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .collect();
  },
});

/**
 * List roles owned by a user.
 */
export const listByOwner = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
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
      roles: v.optional(v.array(v.string())),
    }),
  ),
  customTags: v.optional(v.array(v.string())),
  roleMdText: v.optional(v.string()),
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
    validateRoleFiles(args.files);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.roleMdText) {
      const { frontmatter } = parseFrontmatter(args.roleMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }

    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      dependencies = splitDependencies(parsed.frontmatter.dependencies as string[]);
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        const skill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!skill) throw new Error(`Dependency skill '${spec.slug}' not found in registry`);

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
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

    // Validate role dependencies
    if (dependencies?.roles?.length) {
      for (const depSpec of dependencies.roles) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          throw new Error(`Role cannot depend on itself`);
        }
        const depRole = await ctx.db
          .query("roles")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depRole) throw new Error(`Dependency role '${spec.slug}' not found in registry`);

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("roleVersions")
            .withIndex("by_role", (q) => q.eq("roleId", depRole._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            throw new Error(
              `No version of role '${spec.slug}' satisfies '${spec.operator}${spec.version}'`,
            );
          }
        }
      }
    }

    let role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (role) {
      if (role.ownerUserId !== user._id) throw new Error("You do not own this role");
      if (role.softDeletedAt) throw new Error("Role has been deleted");
    } else {
      const roleId = await ctx.db.insert("roles", {
        slug: args.slug,
        displayName: args.displayName,
        summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : undefined,
        ownerUserId: user._id,
        tags: {},
        stats: { downloads: 0, stars: 0, versions: 0, comments: 0 },
        createdAt: now,
        updatedAt: now,
      });
      role = (await ctx.db.get(roleId))!;
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = role.latestVersionId
      ? (await ctx.db.get(role.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    const existing = await ctx.db
      .query("roleVersions")
      .withIndex("by_role_version", (q) => q.eq("roleId", role!._id).eq("version", version))
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    const versionId = await ctx.db.insert("roleVersions", {
      roleId: role._id,
      version,
      changelog: args.changelog,
      files: args.files,
      parsed,
      dependencies,
      createdBy: user._id,
      createdAt: now,
    });

    const currentTags = (role.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) currentTags[tag] = versionId;
    }

    await ctx.db.patch(role._id, {
      latestVersionId: versionId,
      displayName: args.displayName,
      summary: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : role.summary,
      tags: currentTags,
      stats: { ...role.stats, versions: role.stats.versions + 1 },
      updatedAt: now,
    });

    return { roleId: role._id, versionId };
  },
});

/**
 * Publish a new role version (authenticated via Convex Auth session).
 */
export const publish = mutation({
  args: publishArgs,
  handler: async (ctx, args) => {
    validateSlug(args.slug);
    validateDisplayName(args.displayName);
    validateChangelog(args.changelog);
    validateFiles(args.files);
    validateRoleFiles(args.files);

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.deactivatedAt) throw new Error("Account is deactivated");

    const now = Date.now();

    // Parse ROLE.md frontmatter
    let parsed = { frontmatter: {} as Record<string, unknown>, metadata: undefined as unknown };
    if (args.roleMdText) {
      const { frontmatter } = parseFrontmatter(args.roleMdText);
      parsed = { frontmatter, metadata: frontmatter.metadata };
    }

    // Read dependencies from frontmatter if not provided in args
    let dependencies = args.dependencies;
    if (!dependencies && Array.isArray(parsed.frontmatter.dependencies)) {
      dependencies = splitDependencies(parsed.frontmatter.dependencies as string[]);
    }

    // Validate skill dependencies
    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        const skill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!skill) {
          throw new Error(`Dependency skill '${spec.slug}' not found in registry`);
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
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

    // Validate role dependencies
    if (dependencies?.roles?.length) {
      for (const depSpec of dependencies.roles) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          throw new Error(`Role cannot depend on itself`);
        }
        const depRole = await ctx.db
          .query("roles")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depRole) {
          throw new Error(`Dependency role '${spec.slug}' not found in registry`);
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("roleVersions")
            .withIndex("by_role", (q) => q.eq("roleId", depRole._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            throw new Error(
              `No version of role '${spec.slug}' satisfies '${spec.operator}${spec.version}'`,
            );
          }
        }
      }
    }

    // Find or create role
    let role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (role) {
      if (role.ownerUserId !== user._id) {
        throw new Error("You do not own this role");
      }
      if (role.softDeletedAt) {
        throw new Error("Role has been deleted");
      }
    } else {
      const roleId = await ctx.db.insert("roles", {
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
      role = (await ctx.db.get(roleId))!;
    }

    // Resolve version: use provided, or auto-increment from latest
    const latestVer = role.latestVersionId
      ? (await ctx.db.get(role.latestVersionId))?.version
      : undefined;
    const version = resolveVersion(args.version, latestVer);

    // Check version uniqueness
    const existing = await ctx.db
      .query("roleVersions")
      .withIndex("by_role_version", (q) =>
        q.eq("roleId", role!._id).eq("version", version),
      )
      .first();
    if (existing) throw new Error(`Version ${version} already exists`);

    // Create version
    const versionId = await ctx.db.insert("roleVersions", {
      roleId: role._id,
      version,
      changelog: args.changelog,
      files: args.files,
      parsed,
      dependencies,
      createdBy: user._id,
      createdAt: now,
    });

    // Update role
    const currentTags = (role.tags ?? {}) as Record<string, string>;
    currentTags["latest"] = versionId;
    if (args.customTags) {
      for (const tag of args.customTags) {
        currentTags[tag] = versionId;
      }
    }

    await ctx.db.patch(role._id, {
      latestVersionId: versionId,
      displayName: args.displayName,
      summary: typeof parsed.frontmatter.description === "string"
        ? parsed.frontmatter.description
        : role.summary,
      tags: currentTags,
      stats: { ...role.stats, versions: role.stats.versions + 1 },
      updatedAt: now,
    });

    return { roleId: role._id, versionId };
  },
});

/**
 * Soft-delete a role (admin only).
 */
export const softDelete = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!role) throw new Error("Role not found");

    await ctx.db.patch(role._id, { softDeletedAt: Date.now() });
  },
});

/**
 * Restore a soft-deleted role (admin only).
 */
export const restore = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "admin") throw new Error("Unauthorized");

    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!role) throw new Error("Role not found");

    await ctx.db.patch(role._id, { softDeletedAt: undefined });
  },
});
