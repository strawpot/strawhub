import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const BATCH_SIZE = 1000;

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db.system
      .query("_storage")
      .take(BATCH_SIZE);

    if (files.length === 0) {
      console.log("All files deleted.");
      return;
    }

    for (const file of files) {
      await ctx.storage.delete(file._id);
    }

    console.log(`Deleted ${files.length} files, scheduling next batch...`);
    await ctx.scheduler.runAfter(0, internal.deleteAllFiles.run);
  },
});
