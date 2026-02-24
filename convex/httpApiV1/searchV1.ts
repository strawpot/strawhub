import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { jsonResponse, errorResponse, getSearchParams, checkHttpRateLimit } from "./shared";

/**
 * GET /api/v1/search — search skills and roles
 */
export const searchAll = httpAction(async (ctx, request) => {
  const rateLimited = await checkHttpRateLimit(ctx, request, "search");
  if (rateLimited) return rateLimited;

  const params = getSearchParams(request);
  const query = params.get("q");
  if (!query) return errorResponse("Query parameter 'q' is required", 400);

  const limit = Math.min(parseInt(params.get("limit") ?? "20", 10), 100);
  const kind = (params.get("kind") ?? "all") as "skill" | "role" | "all";

  const results = await ctx.runQuery(api.search.search, {
    query,
    limit,
    kind,
  });

  return jsonResponse({
    query,
    results,
    count: results.length,
  });
});
