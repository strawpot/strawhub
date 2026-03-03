import { query } from "./_generated/server";

/**
 * Return all non-deleted skill, role, and agent slugs with their updatedAt timestamps.
 * Used by the sitemap HTTP endpoint.
 */
export const listAllSlugs = query({
  args: {},
  handler: async (ctx) => {
    const skills = await ctx.db
      .query("skills")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .collect();

    const roles = await ctx.db
      .query("roles")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .collect();

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_updated")
      .filter((q) => q.eq(q.field("softDeletedAt"), undefined))
      .collect();

    return {
      skills: skills.map((s) => ({ slug: s.slug, updatedAt: s.updatedAt })),
      roles: roles.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt })),
      agents: agents.map((a) => ({ slug: a.slug, updatedAt: a.updatedAt })),
    };
  },
});
