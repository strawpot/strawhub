import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared value schemas ────────────────────────────────────────────────────

const fileEntry = v.object({
  path: v.string(),
  size: v.number(),
  storageId: v.id("_storage"),
  sha256: v.string(),
  contentType: v.optional(v.string()),
});

const badgeEntry = v.optional(
  v.object({
    byUserId: v.id("users"),
    at: v.number(),
  }),
);

const badges = v.optional(
  v.object({
    official: badgeEntry,
    highlighted: badgeEntry,
    deprecated: badgeEntry,
  }),
);

const stats = v.object({
  downloads: v.number(),
  stars: v.number(),
  versions: v.number(),
  comments: v.number(),
});

// ─── Schema ──────────────────────────────────────────────────────────────────

export default defineSchema({
  ...authTables,

  // ── Users ────────────────────────────────────────────────────────────────

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    handle: v.optional(v.string()),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("moderator"), v.literal("user"))),
    trustedPublisher: v.optional(v.boolean()),
    deactivatedAt: v.optional(v.number()),
    banReason: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_handle", ["handle"]),

  // ── Skills ───────────────────────────────────────────────────────────────

  skills: defineTable({
    slug: v.string(),
    displayName: v.string(),
    summary: v.optional(v.string()),
    ownerUserId: v.id("users"),
    latestVersionId: v.optional(v.id("skillVersions")),
    tags: v.any(), // Record<string, Id<"skillVersions">>
    badges,
    softDeletedAt: v.optional(v.number()),
    moderationStatus: v.optional(
      v.union(v.literal("active"), v.literal("hidden"), v.literal("removed")),
    ),
    stats,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerUserId"])
    .index("by_updated", ["updatedAt"])
    .index("by_stats_downloads", ["stats.downloads"])
    .index("by_stats_stars", ["stats.stars"]),

  skillVersions: defineTable({
    skillId: v.id("skills"),
    version: v.string(),
    changelog: v.string(),
    files: v.array(fileEntry),
    zipStorageId: v.optional(v.id("_storage")),
    parsed: v.object({
      frontmatter: v.any(),
      metadata: v.optional(v.any()),
    }),
    dependencies: v.optional(
      v.object({
        skills: v.optional(v.array(v.string())),
      }),
    ),
    downloads: v.optional(v.number()),
    scanStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("skipped"),
        v.literal("scanning"),
        v.literal("clean"),
        v.literal("flagged"),
        v.literal("error"),
        v.literal("rate_limited"),
      ),
    ),
    scanResult: v.optional(
      v.object({
        analysisId: v.optional(v.string()),
        positives: v.optional(v.number()),
        total: v.optional(v.number()),
        scanDate: v.optional(v.number()),
        permalink: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    softDeletedAt: v.optional(v.number()),
  })
    .index("by_skill", ["skillId"])
    .index("by_skill_version", ["skillId", "version"]),

  skillEmbeddings: defineTable({
    skillId: v.id("skills"),
    versionId: v.id("skillVersions"),
    ownerId: v.id("users"),
    embedding: v.array(v.float64()),
    isLatest: v.boolean(),
    visibility: v.string(),
    updatedAt: v.number(),
  })
    .index("by_skill", ["skillId"])
    .index("by_version", ["versionId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["visibility"],
    }),

  // ── Roles ────────────────────────────────────────────────────────────────

  roles: defineTable({
    slug: v.string(),
    displayName: v.string(),
    summary: v.optional(v.string()),
    ownerUserId: v.id("users"),
    latestVersionId: v.optional(v.id("roleVersions")),
    tags: v.any(), // Record<string, Id<"roleVersions">>
    badges,
    softDeletedAt: v.optional(v.number()),
    moderationStatus: v.optional(
      v.union(v.literal("active"), v.literal("hidden"), v.literal("removed")),
    ),
    stats,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerUserId"])
    .index("by_updated", ["updatedAt"])
    .index("by_stats_downloads", ["stats.downloads"])
    .index("by_stats_stars", ["stats.stars"]),

  roleVersions: defineTable({
    roleId: v.id("roles"),
    version: v.string(),
    changelog: v.string(),
    files: v.array(fileEntry),
    zipStorageId: v.optional(v.id("_storage")),
    parsed: v.object({
      frontmatter: v.any(),
      metadata: v.optional(v.any()),
    }),
    dependencies: v.optional(
      v.object({
        skills: v.optional(v.array(v.string())),
        roles: v.optional(v.array(v.string())),
      }),
    ),
    downloads: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    softDeletedAt: v.optional(v.number()),
  })
    .index("by_role", ["roleId"])
    .index("by_role_version", ["roleId", "version"]),

  roleEmbeddings: defineTable({
    roleId: v.id("roles"),
    versionId: v.id("roleVersions"),
    ownerId: v.id("users"),
    embedding: v.array(v.float64()),
    isLatest: v.boolean(),
    visibility: v.string(),
    updatedAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_version", ["versionId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["visibility"],
    }),

  // ── Community ────────────────────────────────────────────────────────────

  stars: defineTable({
    targetId: v.string(), // skill or role ID
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_target", ["targetId"])
    .index("by_user", ["userId"])
    .index("by_target_user", ["targetId", "userId"]),

  comments: defineTable({
    targetId: v.string(), // skill or role ID
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    softDeletedAt: v.optional(v.number()),
  })
    .index("by_target", ["targetId"])
    .index("by_user", ["userId"]),

  reports: defineTable({
    targetId: v.string(), // skill or role ID
    targetKind: v.union(v.literal("skill"), v.literal("role")),
    userId: v.id("users"),
    description: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("resolved"),
      v.literal("dismissed"),
    ),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_target", ["targetId"])
    .index("by_user", ["userId"])
    .index("by_target_user", ["targetId", "userId"])
    .index("by_status", ["status"]),

  // ── API Tokens ───────────────────────────────────────────────────────────

  apiTokens: defineTable({
    userId: v.id("users"),
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["tokenHash"]),

  // ── Audit ────────────────────────────────────────────────────────────────

  auditLogs: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetKind: v.string(),
    targetId: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_target", ["targetKind", "targetId"]),

  // ── Rate Limiting ────────────────────────────────────────────────────────

  rateLimits: defineTable({
    key: v.string(), // "ip:{ip}" or "token:{hash}"
    bucket: v.string(), // "read", "write", "search"
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key_bucket", ["key", "bucket"]),
});
