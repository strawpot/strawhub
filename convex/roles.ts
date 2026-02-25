import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { parseFrontmatter } from "./lib/frontmatter";
import { parseDependencySpec, parseVersion, compareVersions, satisfiesVersion, splitDependencies } from "./lib/versionSpec";
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
    paginationOpts: paginationOptsValidator,
    query: v.optional(v.string()),
    sort: v.optional(v.union(
      v.literal("updated"),
      v.literal("downloads"),
      v.literal("stars"),
    )),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("roles")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
    const q = args.query?.toLowerCase();
    const matched = q
      ? result.page.filter(
          (r) =>
            r.displayName.toLowerCase().includes(q) ||
            r.slug.toLowerCase().includes(q) ||
            (r.summary ?? "").toLowerCase().includes(q),
        )
      : result.page;
    const page = await Promise.all(
      matched.map(async (role) => {
        const owner = await ctx.db.get(role.ownerUserId);
        return {
          ...role,
          owner: owner ? { handle: owner.handle, image: owner.image } : null,
        };
      }),
    );
    return { ...result, page };
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
      ...role,
      latestVersion,
      dependencies,
      zipUrl,
      filesWithUrls,
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
    const versions = await ctx.db
      .query("roleVersions")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
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

    // Validate all dependencies (collect errors by category)
    const skillsNotFound: string[] = [];
    const skillVersionMismatch: string[] = [];
    const rolesNotFound: string[] = [];
    const roleVersionMismatch: string[] = [];
    let selfDep = false;

    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        const skill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!skill) {
          skillsNotFound.push(spec.slug);
          continue;
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            skillVersionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
    }

    if (dependencies?.roles?.length) {
      for (const depSpec of dependencies.roles) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          selfDep = true;
          continue;
        }
        const depRole = await ctx.db
          .query("roles")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depRole) {
          rolesNotFound.push(spec.slug);
          continue;
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("roleVersions")
            .withIndex("by_role", (q) => q.eq("roleId", depRole._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            roleVersionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
    }

    const depErrors: string[] = [];
    if (selfDep) depErrors.push("Role cannot depend on itself");
    if (skillsNotFound.length > 0) depErrors.push(`Dependency skill(s) not found in registry: ${JSON.stringify(skillsNotFound)}`);
    if (rolesNotFound.length > 0) depErrors.push(`Dependency role(s) not found in registry: ${JSON.stringify(rolesNotFound)}`);
    if (skillVersionMismatch.length > 0) depErrors.push(`No matching version for skill(s): ${JSON.stringify(skillVersionMismatch)}`);
    if (roleVersionMismatch.length > 0) depErrors.push(`No matching version for role(s): ${JSON.stringify(roleVersionMismatch)}`);
    if (depErrors.length > 0) throw new Error(depErrors.join(". "));

    let role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (role) {
      if (role.ownerUserId !== user._id) throw new Error("You do not own this role");
      if (role.softDeletedAt) throw new Error("Role has been deleted");
    } else {
      // Slug must be unique across both skills and roles
      const conflictingSkill = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (conflictingSkill && !conflictingSkill.softDeletedAt) {
        throw new Error("This slug is already used by a skill");
      }

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

    // Check version is greater than latest
    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new Error(
          `Version ${version} must be greater than the latest version ${latestVer}`,
        );
      }
    }

    const versionId = await ctx.db.insert("roleVersions", {
      roleId: role._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
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

    // Validate all dependencies (collect errors by category)
    const skillsNotFound: string[] = [];
    const skillVersionMismatch: string[] = [];
    const rolesNotFound: string[] = [];
    const roleVersionMismatch: string[] = [];
    let selfDep = false;

    if (dependencies?.skills?.length) {
      for (const depSpec of dependencies.skills) {
        const spec = parseDependencySpec(depSpec);
        const skill = await ctx.db
          .query("skills")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!skill) {
          skillsNotFound.push(spec.slug);
          continue;
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("skillVersions")
            .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            skillVersionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
    }

    if (dependencies?.roles?.length) {
      for (const depSpec of dependencies.roles) {
        const spec = parseDependencySpec(depSpec);
        if (spec.slug === args.slug) {
          selfDep = true;
          continue;
        }
        const depRole = await ctx.db
          .query("roles")
          .withIndex("by_slug", (q) => q.eq("slug", spec.slug))
          .first();
        if (!depRole) {
          rolesNotFound.push(spec.slug);
          continue;
        }

        if (spec.operator !== "latest" && spec.version) {
          const versions = await ctx.db
            .query("roleVersions")
            .withIndex("by_role", (q) => q.eq("roleId", depRole._id))
            .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
            .collect();
          if (!versions.some((v) => satisfiesVersion(v.version, spec))) {
            roleVersionMismatch.push(`${spec.slug} (${spec.operator}${spec.version})`);
          }
        }
      }
    }

    const depErrors: string[] = [];
    if (selfDep) depErrors.push("Role cannot depend on itself");
    if (skillsNotFound.length > 0) depErrors.push(`Dependency skill(s) not found in registry: ${JSON.stringify(skillsNotFound)}`);
    if (rolesNotFound.length > 0) depErrors.push(`Dependency role(s) not found in registry: ${JSON.stringify(rolesNotFound)}`);
    if (skillVersionMismatch.length > 0) depErrors.push(`No matching version for skill(s): ${JSON.stringify(skillVersionMismatch)}`);
    if (roleVersionMismatch.length > 0) depErrors.push(`No matching version for role(s): ${JSON.stringify(roleVersionMismatch)}`);
    if (depErrors.length > 0) throw new Error(depErrors.join(". "));

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
      // Slug must be unique across both skills and roles
      const conflictingSkill = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug))
        .first();
      if (conflictingSkill && !conflictingSkill.softDeletedAt) {
        throw new Error("This slug is already used by a skill");
      }

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

    // Check version is greater than latest
    if (latestVer) {
      if (compareVersions(parseVersion(version), parseVersion(latestVer)) <= 0) {
        throw new Error(
          `Version ${version} must be greater than the latest version ${latestVer}`,
        );
      }
    }

    // Create version
    const versionId = await ctx.db.insert("roleVersions", {
      roleId: role._id,
      version,
      changelog: args.changelog,
      files: args.files,
      zipStorageId: args.zipStorageId,
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
