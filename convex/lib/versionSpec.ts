/**
 * Parse and validate semver version specifiers for dependencies.
 *
 * Supported formats:
 *   "slug"              — resolves to latest
 *   "slug==1.0.0"       — exact version
 *   "slug>=1.0.0"       — minimum version
 *   "slug^1.0.0"        — compatible (same major, >= specified)
 */

export interface DependencySpec {
  slug: string;
  operator: "latest" | "==" | ">=" | "^";
  version: string | null;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

const SPEC_REGEX = /^([a-z0-9][a-z0-9-]*)(==|>=|\^)(\d+\.\d+\.\d+)$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a dependency string into its components.
 *
 *   "git-workflow"           → { slug: "git-workflow", operator: "latest", version: null }
 *   "git-workflow>=1.0.0"    → { slug: "git-workflow", operator: ">=", version: "1.0.0" }
 */
export function parseDependencySpec(spec: string): DependencySpec {
  const input = spec.trim();

  const match = input.match(SPEC_REGEX);
  if (match) {
    return {
      slug: match[1],
      operator: match[2] as "==" | ">=" | "^",
      version: match[3],
    };
  }

  if (SLUG_REGEX.test(input)) {
    return { slug: input, operator: "latest", version: null };
  }

  throw new Error(`Invalid dependency specifier: '${spec}'`);
}

/**
 * Parse a version string "major.minor.patch" into components.
 */
export function parseVersion(version: string): ParsedVersion {
  const match = version.match(VERSION_REGEX);
  if (!match) throw new Error(`Invalid version: '${version}'`);
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two parsed versions.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * Check if a candidate version satisfies a dependency spec.
 *
 *   latest  → always true
 *   ==X.Y.Z → candidate === X.Y.Z
 *   >=X.Y.Z → candidate >= X.Y.Z
 *   ^X.Y.Z  → candidate.major === X.major AND candidate >= X.Y.Z
 */
export function satisfiesVersion(
  candidateVersion: string,
  spec: DependencySpec,
): boolean {
  if (spec.operator === "latest" || !spec.version) return true;

  const candidate = parseVersion(candidateVersion);
  const required = parseVersion(spec.version);

  switch (spec.operator) {
    case "==":
      return compareVersions(candidate, required) === 0;
    case ">=":
      return compareVersions(candidate, required) >= 0;
    case "^":
      return (
        candidate.major === required.major &&
        compareVersions(candidate, required) >= 0
      );
    default:
      return false;
  }
}

/**
 * Extract just the slug from a dependency spec string.
 */
export function extractSlug(spec: string): string {
  return parseDependencySpec(spec).slug;
}
