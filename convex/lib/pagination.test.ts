import { describe, it, expect, vi } from "vitest";
import { paginateWithRecovery } from "./pagination";

describe("paginateWithRecovery", () => {
  it("returns paginate result on success", async () => {
    const result = { data: [1, 2, 3], isDone: false, continueCursor: "abc" };
    const paginate = vi.fn().mockResolvedValue(result);

    const out = await paginateWithRecovery(paginate, {
      numItems: 10,
      cursor: null,
    });

    expect(out).toBe(result);
    expect(paginate).toHaveBeenCalledOnce();
  });

  it("retries from beginning when cursor error occurs", async () => {
    const result = { data: [1], isDone: true, continueCursor: "end" };
    const paginate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Invalid cursor: document was deleted"))
      .mockResolvedValueOnce(result);

    const out = await paginateWithRecovery(paginate, {
      numItems: 10,
      cursor: "stale-cursor",
    });

    expect(out).toBe(result);
    expect(paginate).toHaveBeenCalledTimes(2);
    expect(paginate).toHaveBeenLastCalledWith({
      numItems: 10,
      cursor: null,
    });
  });

  it("rethrows non-cursor errors", async () => {
    const paginate = vi
      .fn()
      .mockRejectedValue(new Error("Internal server error"));

    await expect(
      paginateWithRecovery(paginate, { numItems: 10, cursor: "some-cursor" }),
    ).rejects.toThrow("Internal server error");
  });

  it("rethrows cursor error when cursor is null (initial page)", async () => {
    const paginate = vi
      .fn()
      .mockRejectedValue(new Error("cursor something went wrong"));

    await expect(
      paginateWithRecovery(paginate, { numItems: 10, cursor: null }),
    ).rejects.toThrow("cursor something went wrong");
  });

  it("preserves numItems when retrying", async () => {
    const result = { data: [], isDone: true, continueCursor: "end" };
    const paginate = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad cursor reference"))
      .mockResolvedValueOnce(result);

    await paginateWithRecovery(paginate, {
      numItems: 25,
      cursor: "old-cursor",
    });

    expect(paginate).toHaveBeenLastCalledWith({
      numItems: 25,
      cursor: null,
    });
  });

  it("rethrows when error has no message property", async () => {
    const paginate = vi.fn().mockRejectedValue({ code: 500 });

    await expect(
      paginateWithRecovery(paginate, { numItems: 10, cursor: "c" }),
    ).rejects.toEqual({ code: 500 });
  });
});
