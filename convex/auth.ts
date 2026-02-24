import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    GitHub({
      profile(githubProfile: any) {
        return {
          id: String(githubProfile.id),
          name: githubProfile.name ?? githubProfile.login,
          email: githubProfile.email,
          image: githubProfile.avatar_url,
          githubLogin: githubProfile.login,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const githubLogin = (profile as any).githubLogin;

      if (existingUserId) {
        // Update existing user
        const updates: Record<string, any> = {};
        if (profile.name) updates.name = profile.name;
        if (profile.email) updates.email = profile.email;
        if ((profile as any).image) updates.image = (profile as any).image;
        if (profile.emailVerified) updates.emailVerificationTime = Date.now();
        if (githubLogin) updates.handle = githubLogin;
        updates.deactivatedAt = undefined;

        await ctx.db.patch(existingUserId, updates);
        return existingUserId;
      }

      // Create new user
      return await ctx.db.insert("users", {
        name: profile.name ?? undefined,
        email: profile.email ?? undefined,
        image: (profile as any).image ?? undefined,
        handle: githubLogin ?? undefined,
        emailVerificationTime: profile.emailVerified ? Date.now() : undefined,
      });
    },
  },
});
