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

## Storage URL Generation in Tight Loops (Medium)

`getBySlug` queries call `ctx.storage.getUrl()` per file in a `Promise.all` loop. For packages near the MAX_FILE_COUNT=100 limit, this generates 100 concurrent storage API calls per detail page load.

**Approach:** Either:
1. Cap the number of files that get URL-resolved (e.g., first 50) and provide a separate endpoint for additional file URLs
2. Cache storage URLs with a TTL since they don't change frequently

Currently bounded by MAX_FILE_COUNT=100 so not urgent.

**Files:** `convex/skills.ts`, `convex/roles.ts`, `convex/agents.ts`, `convex/memories.ts` (all `getBySlug` queries)

## Tags Field Schema Validation (Medium)

The `tags` field on skills/roles/agents/memories is typed as `v.any()` with no schema validation. A publisher could theoretically create unbounded custom tags, bloating the document.

**Approach:** Replace `v.any()` with a properly typed and size-constrained validator, e.g., `v.record(v.string(), v.id("skillVersions"))` with a max entries check in the publish mutation.

Currently low risk since `customTags` input is a comma-separated string from the form, but the schema should be tightened.

**Files:** `convex/schema.ts` (lines 74, 175, 248, 338)

## Frontend Download Error Handling (Medium)

The download button's `onClick` handler in skill/role/agent detail pages calls `fetch(zipUrl)` with no `.catch()` or error feedback. If the download fails, nothing is shown to the user.

**Approach:** Wrap the fetch in a try/catch and show a toast or error message on failure.

**Files:** `src/routes/skills.$slug.tsx`, `src/routes/roles.$slug.tsx`, `src/routes/agents.$slug.tsx`

## Revision All SKILL.md

Review and improve all uploaded `SKILL.md` files using the skill-creator tool from Anthropic.
