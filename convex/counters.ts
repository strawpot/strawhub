import { query } from "./_generated/server";

const COUNTER_NAMES = ["skills", "roles", "agents", "memories", "integrations"] as const;

/**
 * Get counts for all resource types.
 * Uses indexed lookups instead of a full table scan.
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const result: Record<string, number> = {};
    const rows = await Promise.all(
      COUNTER_NAMES.map((name) =>
        ctx.db
          .query("counters")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first(),
      ),
    );
    for (const row of rows) {
      if (row) result[row.name] = row.count;
    }
    return result;
  },
});
