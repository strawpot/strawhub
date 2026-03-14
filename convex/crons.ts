import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Flush download stat events every 15 minutes to batch-update target documents.
// This prevents thundering-herd query invalidation when popular items get many
// downloads — instead of N document patches causing N query re-evaluations,
// a single batched patch covers all accumulated events.
crons.interval("flush stat events", { minutes: 15 }, internal.statEvents.flushStatEvents);

// Clean up expired rate limit records every hour to prevent unbounded table growth.
crons.interval("cleanup rate limits", { hours: 1 }, internal.lib.rateLimit.cleanup);

export default crons;
