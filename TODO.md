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

## Frontend Download Error Handling (Medium)

The download button's `onClick` handler in skill/role/agent detail pages calls `fetch(zipUrl)` with no `.catch()` or error feedback. If the download fails, nothing is shown to the user.

**Approach:** Wrap the fetch in a try/catch and show a toast or error message on failure.

**Files:** `src/routes/skills.$slug.tsx`, `src/routes/roles.$slug.tsx`, `src/routes/agents.$slug.tsx`

## CLI Tool Install Subprocess Without Timeout (Medium)

`subprocess.run(spec.command, shell=True)` in tool installation has no timeout. A broken or malicious install script could hang the CLI indefinitely.

**Approach:** Add `timeout=300` (5 min) to `subprocess.run` calls and catch `subprocess.TimeoutExpired`.

**Files:** `cli/src/strawhub/tools.py` (lines ~133-146)

## Revision All SKILL.md

Review and improve all uploaded `SKILL.md` files using the skill-creator tool from Anthropic.
