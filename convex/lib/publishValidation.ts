/**
 * Shared validation for skill and role publish operations.
 */
import { parseVersion } from "./versionSpec";
import { isTextFile } from "./textExtensions";
import { isBinaryByMagicBytes, containsNullBytes } from "./binaryDetection";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export const MAX_SLUG_LENGTH = 64;
export const MAX_DISPLAY_NAME_LENGTH = 128;
export const MAX_CHANGELOG_LENGTH = 10_000;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB total
export const MAX_FILE_COUNT = 100;
export const MAX_DEPENDENCIES = 50; // max skill/role deps per package
export const MAX_DIR_DEPTH = 10; // max directory recursion depth

// Agent-specific limits (agents may include compiled binaries)
export const AGENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
export const AGENT_MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB total
export const AGENT_MAX_FILE_COUNT = 100;

// Memory-specific limits (same as agent — may include binary files)
export const MEMORY_MAX_FILE_SIZE = AGENT_MAX_FILE_SIZE;
export const MEMORY_MAX_TOTAL_SIZE = AGENT_MAX_TOTAL_SIZE;
export const MEMORY_MAX_FILE_COUNT = AGENT_MAX_FILE_COUNT;

export function validateSlug(slug: string): void {
  if (!slug || slug.length > MAX_SLUG_LENGTH) {
    throw new Error(`Slug must be 1-${MAX_SLUG_LENGTH} characters`);
  }
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      "Slug must be lowercase alphanumeric with hyphens, starting with alphanumeric",
    );
  }
}

export function validateVersion(version: string): void {
  parseVersion(version); // throws if not valid X.Y.Z
}

export function validateDisplayName(name: string): void {
  if (!name || name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be 1-${MAX_DISPLAY_NAME_LENGTH} characters`);
  }
}

/**
 * Generate a display name from a slug by title-casing hyphen-separated words.
 * e.g. "github-issues" → "Github Issues"
 */
export function displayNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve the display name: use provided value, fall back to existing, or generate from slug.
 */
export function resolveDisplayName(
  provided: string | undefined,
  existing: string | undefined,
  slug: string,
): string {
  const trimmed = provided?.trim();
  if (trimmed) return trimmed;
  if (existing) return existing;
  return displayNameFromSlug(slug);
}

export function validateChangelog(changelog: string): void {
  if (changelog.length > MAX_CHANGELOG_LENGTH) {
    throw new Error(`Changelog must be under ${MAX_CHANGELOG_LENGTH} characters`);
  }
}

export function validateFiles(
  files: Array<{ path: string; size: number }>,
): void {
  if (files.length === 0) {
    throw new Error("At least one file is required");
  }
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(`Maximum ${MAX_FILE_COUNT} files allowed`);
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File '${file.path}' exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }
    totalSize += file.size;
  }

  if (totalSize > MAX_TOTAL_SIZE) {
    throw new Error(
      `Total upload size exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
    );
  }
}

/**
 * Validate that a skill upload includes a SKILL.md file.
 */
export function validateSkillFiles(
  files: Array<{ path: string; size: number }>,
): void {
  if (!files.some((f) => f.path === "SKILL.md")) {
    throw new Error("Skill uploads must include a SKILL.md file");
  }
}

/**
 * Validate an agent upload: must include AGENT.md, allows binaries.
 */
export function validateAgentFiles(
  files: Array<{ path: string; size: number }>,
): void {
  if (files.length === 0) {
    throw new Error("At least one file is required");
  }
  if (files.length > AGENT_MAX_FILE_COUNT) {
    throw new Error(`Maximum ${AGENT_MAX_FILE_COUNT} files allowed`);
  }
  if (!files.some((f) => f.path === "AGENT.md")) {
    throw new Error("Agent uploads must include an AGENT.md file");
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.size > AGENT_MAX_FILE_SIZE) {
      throw new Error(
        `File '${file.path}' exceeds ${AGENT_MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }
    totalSize += file.size;
  }

  if (totalSize > AGENT_MAX_TOTAL_SIZE) {
    throw new Error(
      `Total upload size exceeds ${AGENT_MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
    );
  }
}

/**
 * Validate a memory upload: must include MEMORY.md, allows binaries.
 */
export function validateMemoryFiles(
  files: Array<{ path: string; size: number }>,
): void {
  if (files.length === 0) {
    throw new Error("At least one file is required");
  }
  if (files.length > MEMORY_MAX_FILE_COUNT) {
    throw new Error(`Maximum ${MEMORY_MAX_FILE_COUNT} files allowed`);
  }
  if (!files.some((f) => f.path === "MEMORY.md")) {
    throw new Error("Memory uploads must include a MEMORY.md file");
  }

  let totalSize = 0;
  for (const file of files) {
    if (file.size > MEMORY_MAX_FILE_SIZE) {
      throw new Error(
        `File '${file.path}' exceeds ${MEMORY_MAX_FILE_SIZE / 1024 / 1024}MB limit`,
      );
    }
    totalSize += file.size;
  }

  if (totalSize > MEMORY_MAX_TOTAL_SIZE) {
    throw new Error(
      `Total upload size exceeds ${MEMORY_MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
    );
  }
}

/**
 * Validate that a role upload contains exactly one file: ROLE.md.
 * Roles are single-file by design — they should not bundle other files.
 */
export function validateRoleFiles(
  files: Array<{ path: string; size: number }>,
): void {
  if (files.length !== 1) {
    throw new Error("Role uploads must contain exactly one file: ROLE.md");
  }
  if (files[0].path !== "ROLE.md") {
    throw new Error("Role uploads must contain exactly one file: ROLE.md");
  }
}

/**
 * Validate that the frontmatter `name` field is present and matches the slug.
 */
export function validateFrontmatterName(
  frontmatter: Record<string, unknown>,
  slug: string,
): void {
  const name = frontmatter.name;
  if (typeof name !== "string" || !name) {
    throw new Error(
      "Frontmatter is missing the required 'name' field",
    );
  }
  if (name !== slug) {
    throw new Error(
      `Frontmatter name '${name}' does not match slug '${slug}'`,
    );
  }
}

/**
 * Verify that a file is actually a text file, not a renamed binary.
 * Uses three layers: extension check, magic bytes detection, null byte heuristic.
 */
export function assertFileIsText(
  filePath: string,
  buffer: Uint8Array,
): void {
  // Layer 1: extension check
  if (!isTextFile(filePath)) {
    throw new Error(
      `File '${filePath}' does not have a recognized text file extension`,
    );
  }

  // Layer 2: magic bytes — reject known binary formats
  if (isBinaryByMagicBytes(buffer)) {
    throw new Error(
      `File '${filePath}' appears to be a binary file (detected binary file signature)`,
    );
  }

  // Layer 3: null byte heuristic
  if (containsNullBytes(buffer, 8192)) {
    throw new Error(
      `File '${filePath}' appears to be a binary file (contains null bytes)`,
    );
  }
}

/** @deprecated Use assertFileIsText instead */
export const assertRoleFileIsText = assertFileIsText;
