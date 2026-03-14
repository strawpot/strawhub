# TODO

## Download Deduplication

Prevent the same user/IP from inflating download counts by downloading the same item repeatedly.

**Approach:** Add a `downloadDedupes` table with hourly-bucketed identity hashing (user ID or IP + skill slug + hour). Check before inserting a `statEvents` row. Add a daily cron to prune expired dedup entries (7-day retention).

Reference: ClawHub uses `downloadDedupes` table with compound index on `(skillId, identityHash, hourStart)`.

## Stats Reconciliation Cron

Add a periodic reconciliation job that recounts stars and comments from source tables and corrects any drift in denormalized `stats` fields on skill/role/agent documents.

**Why:** If a star toggle or comment create/remove fails mid-mutation (after the insert/delete but before the stats patch), the count can drift. A reconciliation cron acts as a safety net.

**Approach:** Add a `reconcileStats` internal mutation that:
1. For each skill/role/agent, count actual stars from the `stars` table and comments from the `comments` table
2. Compare with `stats.stars` and `stats.comments` on the document
3. Patch only if there's a mismatch
4. Process in batches (cursor-based) to avoid timeout

Run hourly or daily via cron.

Reference: ClawHub's `reconcileSkillStarCounts` mutation.

## Star Counter OCC Contention (High)

Popular items receive many concurrent star/unstar operations, all patching the same `stats.stars` field on the skill/role/agent document. This causes Convex OCC (Optimistic Concurrency Control) retries under load.

**Approach:** Move star counting to event-sourced pattern (like downloads already use `statEvents`). Instead of patching `stats.stars` inline during `toggleStar`, insert a `statEvents` row with `kind: "star"` or `kind: "unstar"`. The existing `flushStatEvents` cron (every 15 min) would aggregate and batch-patch counts, eliminating per-request write contention.

**Risk:** Invasive change — requires modifying `toggleStar` mutation, `flushStatEvents` handler, and potentially the real-time star state UX (star count may lag up to 15 minutes).

**Files:** `convex/stars.ts`, `convex/statEvents.ts`

## Starred IDs Pagination Cap (Medium)

Frontend listing pages load starred IDs with `initialNumItems: 1000`. Users who star 1000+ items won't see correct star indicators on listing pages.

**Approach:** Either:
1. Paginate through all starred IDs on the frontend (load more pages until `isDone`)
2. Move the `isStarred` check to the backend `list` query (join against `stars` table using the current user)

Option 2 is cleaner but requires passing the user context into list queries.

**Files:** `src/routes/skills.index.tsx`, `src/routes/roles.index.tsx`, `src/routes/agents.index.tsx`, `src/routes/memories.index.tsx`, optionally `convex/skills.ts` (list query)

## AuthAccounts Query Without Index (Medium)

The `claimSkill` mutation queries `authAccounts` using `.filter()` (full table scan) to find a user's GitHub account. The `authAccounts` table is owned by `@convex-dev/auth` so custom indexes can't be added directly.

**Approach:** Either:
1. Cache the user's GitHub provider account ID on the `users` table during auth signup/link, avoiding the need to query `authAccounts` at claim time
2. Check if `@convex-dev/auth` exposes a utility to look up accounts by userId+provider efficiently

The `claimSkill` operation is rare, so this is low urgency but worth addressing if the `authAccounts` table grows large.

**Files:** `convex/skills.ts` (lines ~685-694, ~728-736)

## Revision All SKILL.md

Review and improve all uploaded `SKILL.md` files using the skill-creator tool from Anthropic.
