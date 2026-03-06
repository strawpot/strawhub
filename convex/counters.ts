import { query } from "./_generated/server";

/**
 * Get counts for all resource types.
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("counters").collect();
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.name] = row.count;
    }
    return result;
  },
});
