import { httpAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { jsonResponse, errorResponse, getSearchParams, resolveTokenToUser, checkHttpRateLimit } from "./shared";
import { validateSlug, validateVersion, validateDisplayName, validateChangelog, validateMemoryFiles, assertFileIsText, MEMORY_MAX_FILE_SIZE } from "../lib/publishValidation";
import { parseFrontmatter, extractName } from "../lib/frontmatter";
import { createZipBlob } from "../lib/zip";

/**
 * GET /api/v1/memories — list memories (cursor-based pagination)
 */
export const listMemories = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const params = getSearchParams(request);
  const sort = params.get("sort") ?? "updated";
  const query = params.get("query") ?? undefined;
  const numItems = Math.min(parseInt(params.get("numItems") ?? params.get("limit") ?? "50", 10) || 50, 200);
  const cursor = params.get("cursor") ?? null;

  const [result, counts] = await Promise.all([
    ctx.runQuery(api.memories.list, {
      paginationOpts: { numItems, cursor },
      sort: sort as "updated" | "downloads" | "stars",
      query,
    }),
    ctx.runQuery(api.counters.getCounts, {}),
  ]);

  return jsonResponse({
    items: result.page.map(formatMemory),
    totalCount: counts.memories ?? 0,
    continueCursor: result.continueCursor,
    isDone: result.isDone,
  }, 200, { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" });
});

/**
 * GET /api/v1/memories/:slug — get memory by slug
 */
export async function handleGetMemory(ctx: any, request: Request): Promise<Response> {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const slug = url.pathname.split("/").pop();
  if (!slug) return errorResponse("Slug required", 400);

  const memory = await ctx.runQuery(api.memories.getBySlug, { slug });
  if (!memory) return errorResponse("Memory not found", 404);

  return jsonResponse(formatMemoryDetail(memory));
}
export const getMemory = httpAction(handleGetMemory);

/**
 * GET /api/v1/memories/:slug/file — get raw file content
 */
export async function handleGetMemoryFile(ctx: any, request: Request): Promise<Response> {
  const rateLimited = await checkHttpRateLimit(ctx, request, "read");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const slug = parts[parts.length - 2];
  const params = getSearchParams(request);
  const filePath = params.get("path") ?? "MEMORY.md";

  const memory = await ctx.runQuery(api.memories.getBySlug, { slug });
  if (!memory?.latestVersion) return errorResponse("Memory not found", 404);

  const file = memory.latestVersion.files.find(
    (f: { path: string }) => f.path === filePath,
  );
  if (!file) return errorResponse(`File '${filePath}' not found`, 404);

  const blob = await ctx.storage.get(file.storageId);
  if (!blob) return errorResponse("File content unavailable", 500);

  const buffer = await blob.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": file.contentType ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
export const getMemoryFile = httpAction(handleGetMemoryFile);

/**
 * POST /api/v1/memories — publish a memory via API (Bearer token auth, multipart form data)
 */
export const publishMemory = httpAction(async (ctx, request) => {
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
  let memoryMdText: string | undefined;
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

    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof Blob) {
        const file = value as File;
        if (file.size > MEMORY_MAX_FILE_SIZE) {
          return errorResponse(`File '${file.name}' exceeds ${MEMORY_MAX_FILE_SIZE / 1024 / 1024}MB limit`, 400);
        }
        const buffer = await file.arrayBuffer();
        const filePath = file.name || "MEMORY.md";

        // Validate MEMORY.md is a real text file, not a renamed binary
        if (filePath === "MEMORY.md") {
          try {
            assertFileIsText(filePath, new Uint8Array(buffer));
          } catch (e: any) {
            return errorResponse(e.message, 400);
          }
          memoryMdText = new TextDecoder().decode(buffer);
        }

        const storageId = await ctx.storage.store(file);
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const sha256 = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
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

  // Validate frontmatter name is present and matches slug
  if (memoryMdText) {
    const { frontmatter } = parseFrontmatter(memoryMdText);
    const fmName = extractName(frontmatter);
    if (!fmName) {
      return errorResponse(
        "Frontmatter is missing the required 'name' field",
        400,
      );
    }
    if (fmName !== slug) {
      return errorResponse(
        `Frontmatter name '${fmName}' does not match slug '${slug}'`,
        400,
      );
    }
  }

  try {
    validateMemoryFiles(fileEntries);
  } catch (e: any) {
    return errorResponse(e.message, 400);
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
    const result = await ctx.runMutation(internal.memories.publishInternal, {
      userId,
      slug,
      displayName,
      version,
      changelog,
      files: fileEntries as any,
      customTags,
      memoryMdText,
      zipStorageId,
    });
    return jsonResponse(result, 201);
  } catch (e: any) {
    return errorResponse(e.message || "Publish failed", 400);
  }
});

/**
 * DELETE /api/v1/memories/:slug — soft-delete a memory (owner or admin)
 */
export async function handleDeleteMemory(ctx: any, request: Request): Promise<Response> {
  const rateLimited = await checkHttpRateLimit(ctx, request, "write");
  if (rateLimited) return rateLimited;

  const authResult = await resolveTokenToUser(ctx, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const url = new URL(request.url);
  const slug = url.pathname.split("/").pop();
  if (!slug) return errorResponse("Slug required", 400);

  try {
    const result = await ctx.runMutation(internal.memories.softDeleteInternal, { slug, userId });
    return jsonResponse(result);
  } catch (e: any) {
    return errorResponse(e.message || "Delete failed", 400);
  }
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatMemory(memory: any) {
  return {
    slug: memory.slug,
    displayName: memory.displayName,
    summary: memory.summary,
    stats: memory.stats,
    badges: memory.badges,
    updatedAt: memory.updatedAt,
  };
}

function formatMemoryDetail(memory: any) {
  return {
    slug: memory.slug,
    displayName: memory.displayName,
    summary: memory.summary,
    owner: memory.owner,
    stats: memory.stats,
    badges: memory.badges,
    zipUrl: memory.zipUrl ?? null,
    latestVersion: memory.latestVersion
      ? {
          version: memory.latestVersion.version,
          changelog: memory.latestVersion.changelog,
          files: memory.latestVersion.files.map((f: any) => ({
            path: f.path,
            size: f.size,
          })),
          createdAt: memory.latestVersion.createdAt,
        }
      : null,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}
