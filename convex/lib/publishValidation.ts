/**
 * Shared validation for skill and role publish operations.
 */
import { parseVersion } from "./versionSpec";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"]);

export const MAX_SLUG_LENGTH = 64;
export const MAX_DISPLAY_NAME_LENGTH = 128;
export const MAX_CHANGELOG_LENGTH = 10_000;
export const MAX_FILE_SIZE = 512 * 1024; // 512 KB per file
export const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2 MB total
export const MAX_FILE_COUNT = 20;

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
    const dotIdx = file.path.lastIndexOf(".");
    const ext = dotIdx >= 0 ? file.path.slice(dotIdx) : "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `File '${file.path}': extension '${ext}' not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File '${file.path}' exceeds ${MAX_FILE_SIZE / 1024}KB limit`,
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
