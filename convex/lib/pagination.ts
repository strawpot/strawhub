import { PaginationOptions } from "convex/server";

/**
 * Wrap a paginate call with stale cursor recovery.
 * If the cursor is invalid (e.g. the referenced document was deleted between
 * pages), restarts from the beginning instead of throwing.
 */
export async function paginateWithRecovery<T>(
  paginate: (opts: PaginationOptions) => Promise<T>,
  paginationOpts: PaginationOptions,
): Promise<T> {
  try {
    return await paginate(paginationOpts);
  } catch (e: any) {
    if (
      paginationOpts.cursor &&
      typeof e?.message === "string" &&
      e.message.includes("cursor")
    ) {
      return await paginate({ ...paginationOpts, cursor: null });
    }
    throw e;
  }
}
