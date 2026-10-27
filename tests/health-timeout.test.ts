import { afterEach, describe, expect, it, vi } from "vitest";

// Unit test: the health-check timer must be cleaned up and the check must
// give up when Redis hangs. Redis itself is replaced by a fake here.
const ping = vi.fn();
vi.mock("../lib/redis", () => ({
  StorageError: class StorageError extends Error {},
  getRedis: () => ({ ping }),
}));

import { pingStore } from "../lib/paste";

afterEach(() => {
  vi.useRealTimers();
  ping.mockReset();
});

describe("pingStore", () => {
  it("returns true and leaves no timer running after a fast PONG", async () => {
    vi.useFakeTimers();
    ping.mockResolvedValue("PONG");
    expect(await pingStore()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns false and leaves no timer running when PING fails", async () => {
    vi.useFakeTimers();
    ping.mockRejectedValue(new Error("down"));
    expect(await pingStore()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up with false when Redis hangs", async () => {
    vi.useFakeTimers();
    ping.mockReturnValue(new Promise(() => {})); // never resolves
    const result = pingStore(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
