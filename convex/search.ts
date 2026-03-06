import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Search skills, roles, and agents using Convex search indexes
 * with lexical boost + popularity scoring.
 */
export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    kind: v.optional(v.union(v.literal("skill"), v.literal("role"), v.literal("agent"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    const kind = args.kind ?? "all";
    const queryTokens = tokenize(args.query);

    const results: SearchResult[] = [];

    if (kind === "all" || kind === "skill") {
      const matched = await ctx.db
        .query("skills")
        .withSearchIndex("search", (q) =>
          q.search("displayName", args.query).eq("softDeletedAt", undefined),
        )
        .take(limit);

      for (const skill of matched) {
        const lexicalBoost = computeLexicalBoost(queryTokens, skill.slug, skill.displayName);
        const popularityBoost = Math.log(Math.max(skill.stats.downloads, 1)) * 0.08;

        results.push({
          kind: "skill",
          slug: skill.slug,
          displayName: skill.displayName,
          summary: skill.summary,
          stats: skill.stats,
          score: lexicalBoost + popularityBoost,
        });
      }
    }

    if (kind === "all" || kind === "role") {
      const matched = await ctx.db
        .query("roles")
        .withSearchIndex("search", (q) =>
          q.search("displayName", args.query).eq("softDeletedAt", undefined),
        )
        .take(limit);

      for (const role of matched) {
        const lexicalBoost = computeLexicalBoost(queryTokens, role.slug, role.displayName);
        const popularityBoost = Math.log(Math.max(role.stats.downloads, 1)) * 0.08;

        results.push({
          kind: "role",
          slug: role.slug,
          displayName: role.displayName,
          summary: role.summary,
          stats: role.stats,
          score: lexicalBoost + popularityBoost,
        });
      }
    }

    if (kind === "all" || kind === "agent") {
      const matched = await ctx.db
        .query("agents")
        .withSearchIndex("search", (q) =>
          q.search("displayName", args.query).eq("softDeletedAt", undefined),
        )
        .take(limit);

      for (const agent of matched) {
        const lexicalBoost = computeLexicalBoost(queryTokens, agent.slug, agent.displayName);
        const popularityBoost = Math.log(Math.max(agent.stats.downloads, 1)) * 0.08;

        results.push({
          kind: "agent",
          slug: agent.slug,
          displayName: agent.displayName,
          summary: agent.summary,
          stats: agent.stats,
          score: lexicalBoost + popularityBoost,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SearchResult {
  kind: "skill" | "role" | "agent";
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
