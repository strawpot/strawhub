import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { jsonResponse, errorResponse, getSearchParams, resolveTokenToUser, hashToken, checkHttpRateLimit } from "./shared";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, MAX_FILE_SIZE } from "../lib/publishValidation";
import { createZipBlob } from "../lib/zip";

/**
 * GET /api/v1/skills — list skills
 */
export const listSkills = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const params = getSearchParams(request);
  const sort = params.get("sort") ?? "updated";
  const query = params.get("query") ?? undefined;

  const skills = await ctx.runQuery(api.skills.list, {
    sort: sort as "updated" | "downloads" | "stars",
    query,
  });

  return jsonResponse({
    items: skills.map(formatSkill),
    count: skills.length,
  });
});

/**
 * GET /api/v1/skills/:slug — get skill by slug
 */
export async function handleGetSkill(ctx: any, request: Request): Promise<Response> {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const slug = url.pathname.split("/").pop();
  if (!slug) return errorResponse("Slug required", 400);

  const skill = await ctx.runQuery(api.skills.getBySlug, { slug });
  if (!skill) return errorResponse("Skill not found", 404);

  return jsonResponse(formatSkillDetail(skill));
}
export const getSkill = httpAction(handleGetSkill);

/**
 * GET /api/v1/skills/:slug/file — get raw file content
 */
export async function handleGetSkillFile(ctx: any, request: Request): Promise<Response> {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  // /api/v1/skills/:slug/file
  const slug = parts[parts.length - 2];
  const params = getSearchParams(request);
  const filePath = params.get("path") ?? "SKILL.md";

  const skill = await ctx.runQuery(api.skills.getBySlug, { slug });
  if (!skill?.latestVersion) return errorResponse("Skill not found", 404);

  const file = skill.latestVersion.files.find(
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
}
export const getSkillFile = httpAction(handleGetSkillFile);

/**
 * POST /api/v1/skills — publish a skill via API (Bearer token auth, multipart form data)
 */
export const publishSkill = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "write");
  if (rateLimited) return rateLimited;

  const authResult = await resolveTokenToUser(ctx, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const contentType = request.headers.get("Content-Type") ?? "";

  let slug: string;
  let displayName: string;
  let version: string;
  let changelog: string;
  let customTags: string[] | undefined;
  let dependencies: { skills?: string[] } | undefined;
  let skillMdText: string | undefined;
  const fileEntries: Array<{
    path: string;
    size: number;
    storageId: string;
    sha256: string;
    contentType?: string;
  }> = [];
  const zipEntries: Array<{ path: string; buffer: ArrayBuffer }> = [];

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
        return errorResponse("dependencies must be valid JSON: {\"skills\": [...]}", 400);
      }
    }

    if (!slug || !displayName || !version) {
      return errorResponse("slug, displayName, and version are required", 400);
    }

    // Validate inputs before storing files
    try {
      validateSlug(slug);
      validateVersion(version);
      validateDisplayName(displayName);
      validateChangelog(changelog);
    } catch (e: any) {
      return errorResponse(e.message, 400);
    }

    // Process file fields and collect buffers for zip
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof Blob) {
        const file = value as File;
        if (file.size > MAX_FILE_SIZE) {
          return errorResponse(`File '${file.name}' exceeds ${MAX_FILE_SIZE / 1024}KB limit`, 400);
        }
        const storageId = await ctx.storage.store(file);
        // Compute SHA-256
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const sha256 = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const filePath = file.name || "SKILL.md";
        if (filePath === "SKILL.md") {
          skillMdText = new TextDecoder().decode(buffer);
        }
        zipEntries.push({ path: filePath, buffer });
        fileEntries.push({
          path: filePath,
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

  // Create and store zip archive
  const zipPrefix = `${slug}-${version}`;
  const zipBlob = await createZipBlob(
    zipEntries.map((e) => ({ path: `${zipPrefix}/${e.path}`, content: e.buffer })),
  );
  const zipStorageId = await ctx.storage.store(
    new Blob([zipBlob], { type: "application/zip" }),
  );

  try {
    const result = await ctx.runMutation(internal.skills.publishInternal, {
      userId,
      slug,
      displayName,
      version,
      changelog,
      files: fileEntries as any,
      dependencies,
      customTags,
      skillMdText,
      zipStorageId,
    });
    return jsonResponse(result, 201);
  } catch (e: any) {
    return errorResponse(e.message || "Publish failed", 400);
  }
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSkill(skill: any) {
  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    stats: skill.stats,
    badges: skill.badges,
    updatedAt: skill.updatedAt,
  };
}

function formatSkillDetail(skill: any) {
  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    owner: skill.owner,
    stats: skill.stats,
    badges: skill.badges,
    dependencies: skill.dependencies,
    zipUrl: skill.zipUrl ?? null,
    latestVersion: skill.latestVersion
      ? {
          version: skill.latestVersion.version,
          changelog: skill.latestVersion.changelog,
          dependencies: skill.latestVersion.dependencies,
          files: skill.latestVersion.files.map((f: any) => ({
            path: f.path,
            size: f.size,
          })),
          createdAt: skill.latestVersion.createdAt,
        }
      : null,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}
