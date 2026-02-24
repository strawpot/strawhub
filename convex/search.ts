import { v } from "convex/values";
import { query } from "./_generated/server";
import { generateEmbedding } from "./lib/embeddings";

/**
 * Hybrid search: vector similarity + lexical boost + popularity.
 * Searches both skills and roles.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    kind: v.optional(v.union(v.literal("skill"), v.literal("role"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    const kind = args.kind ?? "all";
    const queryTokens = tokenize(args.query);

    const results: SearchResult[] = [];

    // Vector search for skills
    if (kind === "all" || kind === "skill") {
      const skillEmbedding = await generateEmbedding(args.query);
      const skillResults = await ctx.db
        .query("skillEmbeddings")
        .filter((q) => q.eq(q.field("visibility"), "public"))
        .take(limit * 2);

      for (const emb of skillResults) {
        const skill = await ctx.db.get(emb.skillId);
        if (!skill || skill.softDeletedAt) continue;

        const lexicalBoost = computeLexicalBoost(queryTokens, skill.slug, skill.displayName);
        const popularityBoost = Math.log(Math.max(skill.stats.downloads, 1)) * 0.08;

        results.push({
          kind: "skill" as const,
          slug: skill.slug,
          displayName: skill.displayName,
          summary: skill.summary,
          stats: skill.stats,
          score: lexicalBoost + popularityBoost,
        });
      }
    }

    // Vector search for roles
    if (kind === "all" || kind === "role") {
      const roleResults = await ctx.db
        .query("roleEmbeddings")
        .filter((q) => q.eq(q.field("visibility"), "public"))
        .take(limit * 2);

      for (const emb of roleResults) {
        const role = await ctx.db.get(emb.roleId);
        if (!role || role.softDeletedAt) continue;

        const lexicalBoost = computeLexicalBoost(queryTokens, role.slug, role.displayName);
        const popularityBoost = Math.log(Math.max(role.stats.downloads, 1)) * 0.08;

        results.push({
          kind: "role" as const,
          slug: role.slug,
          displayName: role.displayName,
          summary: role.summary,
          stats: role.stats,
          score: lexicalBoost + popularityBoost,
        });
      }
    }

    // Fallback: if no embedding results, do text-based scan
    if (results.length === 0) {
      if (kind === "all" || kind === "skill") {
        const allSkills = await ctx.db
          .query("skills")
          .withIndex("by_updated")
          .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
          .take(500);

        for (const skill of allSkills) {
          const boost = computeLexicalBoost(queryTokens, skill.slug, skill.displayName);
          if (boost > 0) {
            results.push({
              kind: "skill",
              slug: skill.slug,
              displayName: skill.displayName,
              summary: skill.summary,
              stats: skill.stats,
              score: boost,
            });
          }
        }
      }

      if (kind === "all" || kind === "role") {
        const allRoles = await ctx.db
          .query("roles")
          .withIndex("by_updated")
          .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
          .take(500);

        for (const role of allRoles) {
          const boost = computeLexicalBoost(queryTokens, role.slug, role.displayName);
          if (boost > 0) {
            results.push({
              kind: "role",
              slug: role.slug,
              displayName: role.displayName,
              summary: role.summary,
              stats: role.stats,
              score: boost,
            });
          }
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SearchResult {
  kind: "skill" | "role";
  slug: string;
  displayName: string;
  summary?: string;
  stats: { downloads: number; stars: number; versions: number; comments: number };
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_./]+/)
    .filter((t) => t.length > 0);
}

function computeLexicalBoost(
  queryTokens: string[],
  slug: string,
  displayName: string,
): number {
  const slugTokens = tokenize(slug);
  const nameTokens = tokenize(displayName);
  let boost = 0;

  for (const qt of queryTokens) {
    // Slug exact match
    if (slugTokens.includes(qt)) boost += 1.4;
    // Slug prefix match
    else if (slugTokens.some((st) => st.startsWith(qt))) boost += 0.8;

    // Name exact match
    if (nameTokens.includes(qt)) boost += 1.1;
    // Name prefix match
    else if (nameTokens.some((nt) => nt.startsWith(qt))) boost += 0.6;
  }

  return boost;
}
