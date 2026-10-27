import { afterEach, describe, expect, it } from "vitest";
import { APP_NOENV_URL, APP_URL, PROXY_URL } from "./config";
import { createPaste, getPaste, makePaste, viewPaste } from "./helpers/client";

const setStorageDown = (fail: boolean) =>
  fetch(`${PROXY_URL}/__control`, { method: "POST", body: JSON.stringify({ fail }) });

afterEach(async () => {
  await setStorageDown(false);
});

describe("when the persistence layer is unavailable", () => {
  it("health returns 503 with a JSON error", async () => {
    await setStorageDown(true);
    const res = await fetch(`${APP_URL}/api/healthz`);
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("health responds quickly even when storage is down", async () => {
    await setStorageDown(true);
    const start = Date.now();
    await fetch(`${APP_URL}/api/healthz`);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("create and fetch return 503 JSON without leaking internals", async () => {
    const { id } = await makePaste({ content: "x" });
    await setStorageDown(true);
    const create = await createPaste({ content: "y" });
    expect(create.status).toBe(503);
    const text = await create.text();
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toMatch(/token|upstash|simulated|stack/i);
    const fetched = await getPaste(id);
    expect(fetched.status).toBe(503);
    expect(fetched.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("recovers, and data is intact, once storage is back", async () => {
    const { id } = await makePaste({ content: "survives", max_views: 2 });
    await setStorageDown(true);
    await getPaste(id);
    await setStorageDown(false);
    const res = await getPaste(id);
    expect(res.status).toBe(200);
    expect((await res.json()).remaining_views).toBe(1);
  });

  it("HTML page does not crash into a raw error with a stack trace", async () => {
    const { id } = await makePaste({ content: "x" });
    await setStorageDown(true);
    const res = await viewPaste(id);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.text()).not.toMatch(/at \w+ \(|node_modules/);
  });
});

describe("when storage environment variables are missing", () => {
  it("health returns 503 JSON", async () => {
    const res = await fetch(`${APP_NOENV_URL}/api/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it("create returns 503 JSON instead of crashing", async () => {
    const res = await fetch(`${APP_NOENV_URL}/api/pastes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(503);
    expect(typeof (await res.json()).error).toBe("string");
  });
});
