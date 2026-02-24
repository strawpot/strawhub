import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Check if a user has moderator or admin role.
 */
export async function isModerator(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user?.role === "moderator" || user?.role === "admin";
}

/**
 * Check if a user has admin role.
 */
export async function isAdmin(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user?.role === "admin";
}

/**
 * Check if a user owns a skill.
 */
export async function isSkillOwner(
  ctx: QueryCtx,
  skillId: Id<"skills">,
  userId: Id<"users">,
): Promise<boolean> {
  const skill = await ctx.db.get(skillId);
  return skill?.ownerUserId === userId;
}

/**
 * Check if a user owns a role.
 */
export async function isRoleOwner(
  ctx: QueryCtx,
  roleId: Id<"roles">,
  userId: Id<"users">,
): Promise<boolean> {
  const role = await ctx.db.get(roleId);
  return role?.ownerUserId === userId;
}
