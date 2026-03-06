import { internalMutation } from "./_generated/server";

const MAX_EVENTS_PER_BATCH = 500;

/**
 * Flush pending stat events into target documents.
 * Processes up to MAX_EVENTS_PER_BATCH events per run, aggregates deltas per
 * target, and applies them in a single patch per target.
 */
export const flushStatEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("statEvents")
      .withIndex("by_createdAt")
      .order("asc")
      .take(MAX_EVENTS_PER_BATCH);

    if (events.length === 0) return { processed: 0 };

    // Aggregate download deltas per target
    const targetDeltas = new Map<string, number>();
    const versionDeltas = new Map<string, number>();

    for (const event of events) {
      targetDeltas.set(
        event.targetId,
        (targetDeltas.get(event.targetId) ?? 0) + 1,
      );
      if (event.versionId) {
        versionDeltas.set(
          event.versionId,
          (versionDeltas.get(event.versionId) ?? 0) + 1,
        );
      }
    }

    // Apply deltas to target documents
    for (const [targetId, delta] of targetDeltas) {
      const target = await ctx.db.get(targetId as any);
      if (target && (target as any).stats) {
        await ctx.db.patch(target._id, {
          stats: {
            ...(target as any).stats,
            downloads: (target as any).stats.downloads + delta,
          },
        });
      }
    }

    // Apply deltas to version documents
    for (const [versionId, delta] of versionDeltas) {
      const ver = await ctx.db.get(versionId as any);
      if (ver) {
        await ctx.db.patch(ver._id, {
          downloads: ((ver as any).downloads ?? 0) + delta,
        });
      }
    }

    // Delete processed events
    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return { processed: events.length, targets: targetDeltas.size };
  },
});
