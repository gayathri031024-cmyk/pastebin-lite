import { afterEach, describe, expect, it } from "vitest";
import { nowMs } from "../lib/time";

const original = process.env.TEST_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.TEST_MODE;
  else process.env.TEST_MODE = original;
});

describe("nowMs", () => {
  it("uses x-test-now-ms only when TEST_MODE=1", () => {
    process.env.TEST_MODE = "1";
    expect(nowMs(new Headers({ "x-test-now-ms": "12345" }))).toBe(12345);
  });

  it("ignores the header outside test mode", () => {
    delete process.env.TEST_MODE;
    const before = Date.now();
    const t = nowMs(new Headers({ "x-test-now-ms": "12345" }));
    expect(t).toBeGreaterThanOrEqual(before);
  });

  it("ignores TEST_MODE values other than 1", () => {
    process.env.TEST_MODE = "0";
    expect(nowMs(new Headers({ "x-test-now-ms": "12345" }))).not.toBe(12345);
  });

  it("falls back to real time when the header is absent or malformed", () => {
    process.env.TEST_MODE = "1";
    const before = Date.now();
    expect(nowMs(new Headers())).toBeGreaterThanOrEqual(before);
    expect(nowMs(new Headers({ "x-test-now-ms": "abc" }))).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ["decimal", "1.5"],
    ["negative", "-5"],
    ["exponent", "1e3"],
    ["unsafe integer", "9007199254740993"],
    ["beyond Date range", "8640000000000001"],
    ["400 digits", "9".repeat(400)],
  ])("ignores a %s header and uses the real clock", (_n, value) => {
    process.env.TEST_MODE = "1";
    const before = Date.now();
    const t = nowMs(new Headers({ "x-test-now-ms": value }));
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThan(before + 5000);
  });

  it("accepts the largest representable timestamp", () => {
    process.env.TEST_MODE = "1";
    expect(nowMs(new Headers({ "x-test-now-ms": "8640000000000000" }))).toBe(8.64e15);
  });
});
