import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { jsonResponse, errorResponse, getSearchParams, resolveTokenToUser } from "./shared";
import { parseDependencySpec, satisfiesVersion } from "../lib/versionSpec";

/**
 * GET /api/v1/roles — list roles
 */
export const listRoles = httpAction(async (ctx, request) => {
  const params = getSearchParams(request);
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 200);
  const sort = params.get("sort") ?? "updated";

  const roles = await ctx.runQuery(api.roles.list, {
    limit,
    sort: sort as "updated" | "downloads" | "stars",
  });

  return jsonResponse({
    items: roles.map(formatRole),
    count: roles.length,
  });
});

/**
 * GET /api/v1/roles/:slug — get role by slug
 */
export const getRole = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const slug = url.pathname.split("/").pop();
  if (!slug) return errorResponse("Slug required", 400);

  const role = await ctx.runQuery(api.roles.getBySlug, { slug });
  if (!role) return errorResponse("Role not found", 404);

  return jsonResponse(formatRoleDetail(role));
});

/**
 * GET /api/v1/roles/:slug/file — get raw file content
 */
export const getRoleFile = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const slug = parts[parts.length - 2];
  const params = getSearchParams(request);
  const filePath = params.get("path") ?? "ROLE.md";

  const role = await ctx.runQuery(api.roles.getBySlug, { slug });
  if (!role?.latestVersion) return errorResponse("Role not found", 404);

  const file = role.latestVersion.files.find(
    (f: { path: string }) => f.path === filePath,
  );
  if (!file) return errorResponse(`File '${filePath}' not found`, 404);

  const blob = await ctx.storage.get(file.storageId);
  if (!blob) return errorResponse("File content unavailable", 500);

  const text = await blob.text();
  return new Response(text, {
    headers: {
      "Content-Type": file.contentType ?? "text/markdown",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

/**
 * GET /api/v1/roles/:slug/resolve — resolve dependencies recursively
 */
export const resolveRoleDeps = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const slug = parts[parts.length - 2];

  const role = await ctx.runQuery(api.roles.getBySlug, { slug });
  if (!role) return errorResponse("Role not found", 404);

  // Resolve transitive dependencies (skills + roles) with version awareness
  const resolved: Array<{ kind: "skill" | "role"; slug: string; version: string }> = [];
  const resolvedKeys = new Set<string>();
  const visiting = new Set<string>();

  async function resolveSkill(depSpec: string) {
    const spec = parseDependencySpec(depSpec);
    const key = `skill:${spec.slug}`;
    if (resolvedKeys.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Circular dependency: ${spec.slug}`);
    }
    visiting.add(key);

    const skill = await ctx.runQuery(api.skills.getBySlug, { slug: spec.slug });
    if (!skill) throw new Error(`Dependency skill '${spec.slug}' not found`);

    let resolvedVersion: string | null = null;
    if (spec.operator === "latest") {
      if (skill.latestVersion) {
        resolvedVersion = skill.latestVersion.version;
      }
    } else {
      const versions = await ctx.runQuery(api.skills.getVersions, {
        skillId: skill._id,
      });
      for (const v of versions) {
        if (satisfiesVersion(v.version, spec)) {
          resolvedVersion = v.version;
          break;
        }
      }
    }

    if (!resolvedVersion) {
      throw new Error(
        `No version of skill '${spec.slug}' satisfies '${spec.operator}${spec.version ?? ""}'`,
      );
    }

    // Recurse into transitive skill deps (skills can only depend on other skills)
    for (const dep of skill.dependencies?.skills ?? []) {
      await resolveSkill(dep);
    }

    visiting.delete(key);
    resolvedKeys.add(key);
    resolved.push({ kind: "skill", slug: spec.slug, version: resolvedVersion });
  }

  async function resolveRole(depSpec: string) {
    const spec = parseDependencySpec(depSpec);
    const key = `role:${spec.slug}`;
    if (resolvedKeys.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Circular dependency: ${spec.slug}`);
    }
    visiting.add(key);

    const depRole = await ctx.runQuery(api.roles.getBySlug, { slug: spec.slug });
    if (!depRole) throw new Error(`Dependency role '${spec.slug}' not found`);

    let resolvedVersion: string | null = null;
    if (spec.operator === "latest") {
      if (depRole.latestVersion) {
        resolvedVersion = depRole.latestVersion.version;
      }
    } else {
      const versions = await ctx.runQuery(api.roles.getVersions, {
        roleId: depRole._id,
      });
      for (const v of versions) {
        if (satisfiesVersion(v.version, spec)) {
          resolvedVersion = v.version;
          break;
        }
      }
    }

    if (!resolvedVersion) {
      throw new Error(
        `No version of role '${spec.slug}' satisfies '${spec.operator}${spec.version ?? ""}'`,
      );
    }

    // Recurse into transitive deps from role dependencies
    for (const dep of depRole.dependencies?.skills ?? []) {
      await resolveSkill(dep);
    }
    for (const dep of depRole.dependencies?.roles ?? []) {
      await resolveRole(dep);
    }

    visiting.delete(key);
    resolvedKeys.add(key);
    resolved.push({ kind: "role", slug: spec.slug, version: resolvedVersion });
  }

  try {
    for (const dep of role.dependencies?.skills ?? []) {
      await resolveSkill(dep);
    }
    for (const dep of role.dependencies?.roles ?? []) {
      await resolveRole(dep);
    }
  } catch (e: any) {
    return errorResponse(e.message, 400);
  }

  return jsonResponse({
    role: slug,
    dependencies: resolved,
  });
});

/**
 * POST /api/v1/roles — publish a role via API (Bearer token auth, multipart form data)
 */
export const publishRole = httpAction(async (ctx, request) => {
  const authResult = await resolveTokenToUser(ctx, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const contentType = request.headers.get("Content-Type") ?? "";

  let slug: string;
  let displayName: string;
  let version: string;
  let changelog: string;
  let customTags: string[] | undefined;
  let dependencies: { skills?: string[]; roles?: string[] } | undefined;
  const fileEntries: Array<{
    path: string;
    size: number;
    storageId: string;
    sha256: string;
    contentType?: string;
  }> = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    slug = formData.get("slug") as string;
    displayName = formData.get("displayName") as string;
    version = formData.get("version") as string;
    changelog = (formData.get("changelog") as string) ?? "";
    const tagsStr = formData.get("customTags") as string | null;
    if (tagsStr) customTags = tagsStr.split(",").map((s) => s.trim()).filter(Boolean);

    const depsStr = formData.get("dependencies") as string | null;
    if (depsStr) {
      try {
        dependencies = JSON.parse(depsStr);
      } catch {
        return errorResponse("dependencies must be valid JSON: {\"skills\": [...], \"roles\": [...]}", 400);
      }
    }

    if (!slug || !displayName || !version) {
      return errorResponse("slug, displayName, and version are required", 400);
    }

    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof Blob) {
        const file = value as File;
        const storageId = await ctx.storage.store(file);
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const sha256 = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        fileEntries.push({
          path: file.name || "ROLE.md",
          size: file.size,
          storageId: storageId as unknown as string,
          sha256,
          contentType: file.type || undefined,
        });
      }
    }
  } else {
    return errorResponse("Content-Type must be multipart/form-data", 415);
  }

  if (fileEntries.length === 0) {
    return errorResponse("At least one file is required", 400);
  }

  try {
    const result = await ctx.runMutation(internal.roles.publishInternal, {
      userId,
      slug,
      displayName,
      version,
      changelog,
      files: fileEntries as any,
      dependencies,
      customTags,
    });
    return jsonResponse(result, 201);
  } catch (e: any) {
    return errorResponse(e.message || "Publish failed", 400);
  }
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatRole(role: any) {
  return {
    slug: role.slug,
    displayName: role.displayName,
    summary: role.summary,
    stats: role.stats,
    badges: role.badges,
    updatedAt: role.updatedAt,
  };
}

function formatRoleDetail(role: any) {
  return {
    slug: role.slug,
    displayName: role.displayName,
    summary: role.summary,
    owner: role.owner,
    stats: role.stats,
    badges: role.badges,
    dependencies: role.dependencies,
    latestVersion: role.latestVersion
      ? {
          version: role.latestVersion.version,
          changelog: role.latestVersion.changelog,
          dependencies: role.latestVersion.dependencies,
          files: role.latestVersion.files.map((f: any) => ({
            path: f.path,
            size: f.size,
          })),
          createdAt: role.latestVersion.createdAt,
        }
      : null,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
