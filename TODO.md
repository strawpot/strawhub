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

## Revision All SKILL.md

Review and improve all uploaded `SKILL.md` files using the skill-creator tool from Anthropic.
