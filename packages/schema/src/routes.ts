// ─── Shared API response types ───────────────────────────────────────────────

export interface Stats {
  downloads: number;
  stars: number;
  versions: number;
  comments: number;
}

export interface OwnerInfo {
  handle?: string;
  displayName?: string;
  image?: string;
}

export interface FileInfo {
  path: string;
  size: number;
}

export interface Dependencies {
  skills?: string[];
  roles?: string[];
}

export interface VersionInfo {
  version: string;
  changelog: string;
  files: FileInfo[];
  createdAt: number;
}

export interface VersionInfoWithDeps extends VersionInfo {
  dependencies?: Dependencies;
}

// ─── Skills ──────────────────────────────────────────────────────────────────

export interface SkillSummary {
  slug: string;
  displayName: string;
  summary?: string;
  stats: Stats;
  updatedAt: number;
}

export interface SkillListResponse {
  items: SkillSummary[];
  count: number;
}

export interface SkillDetailResponse {
  slug: string;
  displayName: string;
  summary?: string;
  owner: OwnerInfo | null;
  stats: Stats;
  dependencies: { skills: string[] };
  latestVersion: VersionInfoWithDeps | null;
  createdAt: number;
  updatedAt: number;
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface RoleSummary {
  slug: string;
  displayName: string;
  summary?: string;
  stats: Stats;
  updatedAt: number;
}

export interface RoleListResponse {
  items: RoleSummary[];
  count: number;
}

export interface RoleDetailResponse {
  slug: string;
  displayName: string;
  summary?: string;
  owner: OwnerInfo | null;
  stats: Stats;
  dependencies: { skills: string[]; roles: string[] };
  latestVersion: VersionInfoWithDeps | null;
  createdAt: number;
  updatedAt: number;
}

export interface ResolvedDependency {
  kind: "skill" | "role";
  slug: string;
  version: string;
}

export interface RoleResolveResponse {
  role: string;
  dependencies: ResolvedDependency[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: "skill" | "role";
  slug: string;
  displayName: string;
  summary?: string;
  stats: Stats;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  count: number;
}
