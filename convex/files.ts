import { mutation } from "./_generated/server";

/**
 * Generate a pre-signed upload URL for Convex file storage.
 * Auth-gated: only signed-in users can upload files.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});
