import http from "node:http";
import { describe, expect, it } from "vitest";
import { APP_URL, PORTS } from "./config";
import { createPaste, getPaste, makePaste, viewPaste } from "./helpers/client";

const T0 = 1_800_000_000_000; // fixed fake "now" for deterministic expiry tests

describe("health", () => {
  it("returns 200 JSON when storage is healthy", async () => {
    const res = await fetch(`${APP_URL}/api/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("creating pastes", () => {
  it("creates a paste and returns id + url pointing at /p/:id on this origin", async () => {
    const res = await createPaste({ content: "hello" });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const data = await res.json();
    expect(typeof data.id).toBe("string");
    expect(data.id.length).toBeGreaterThanOrEqual(12);
    expect(data.url).toBe(`${APP_URL}/p/${data.id}`);
  });

  it("generates unique ids", async () => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => makePaste({ content: "x" })));
    expect(new Set(ids.map((p) => p.id)).size).toBe(25);
  });

  it("ignores spoofed forwarded headers when building the url", async () => {
    const res = await createPaste({ content: "x" }, { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
    const data = await res.json();
    expect(data.url).not.toContain("evil.example");
  });

  it.each([
    ["missing content", {}],
    ["empty content", { content: "" }],
    ["whitespace-only content", { content: "   \n " }],
    ["null content", { content: null }],
    ["numeric content", { content: 123 }],
    ["object content", { content: { a: 1 } }],
    ["array content", { content: ["a"] }],
  ])("rejects %s with 400 JSON", async (_n, body) => {
    const res = await createPaste(body);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it.each([["{not json"], [""], ["[]"], ["null"], ['"text"']])("rejects malformed/non-object body %j", async (raw) => {
    const res = await createPaste(raw);
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("rejects oversized content", async () => {
    const res = await createPaste({ content: "a".repeat(600 * 1024) });
    expect(res.status).toBe(413);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it.each([
    ["zero", 0], ["negative", -5], ["decimal", 1.5], ["string", "60"], ["null", null],
    ["boolean", true], ["array", [1]], ["unsafe integer", 2 ** 53], ["too large to represent as a date", Number.MAX_SAFE_INTEGER],
  ])("rejects ttl_seconds = %s", async (_n, ttl_seconds) => {
    const res = await createPaste({ content: "x", ttl_seconds });
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it.each([
    ["zero", 0], ["negative", -1], ["decimal", 2.5], ["string", "5"], ["null", null],
    ["boolean", false], ["unsafe integer", 2 ** 53],
  ])("rejects max_views = %s", async (_n, max_views) => {
    const res = await createPaste({ content: "x", max_views });
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("accepts the largest safe integer for max_views", async () => {
    const { id } = await makePaste({ content: "x", max_views: Number.MAX_SAFE_INTEGER });
    const data = await (await getPaste(id)).json();
    expect(data.remaining_views).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
});

describe("fetching pastes via the API", () => {
  it("returns the original content with null limits when unconstrained, on every fetch", async () => {
    const { id } = await makePaste({ content: "plain text" });
    for (let i = 0; i < 5; i++) {
      const res = await getPaste(id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(await res.json()).toEqual({ content: "plain text", remaining_views: null, expires_at: null });
    }
  });

  it("round-trips tricky content exactly (JSON-looking, numeric, unicode, whitespace)", async () => {
    const samples = ['{"a":1}', "12345", "true", "null", "[1,2,3]", "héllo 🌍 日本語", "  leading\n\ttabs and trailing  \n", '"quoted"'];
    for (const content of samples) {
      const { id } = await makePaste({ content });
      const data = await (await getPaste(id)).json();
      expect(data.content).toBe(content);
    }
  });

  it("returns 404 JSON for a missing paste", async () => {
    const res = await getPaste("doesnotexist123");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it.each(["..%2F..%2Fetc", "a".repeat(200), "bad%20id", "%00"])("returns 404 for odd id %s", async (id) => {
    const res = await getPaste(id);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

describe("view limits", () => {
  it("max_views=1: first fetch 200, second 404", async () => {
    const { id } = await makePaste({ content: "once", max_views: 1 });
    const first = await getPaste(id);
    expect(first.status).toBe(200);
    expect((await first.json()).remaining_views).toBe(0);
    expect((await getPaste(id)).status).toBe(404);
  });

  it("max_views=2: two fetches succeed, third is 404, counts down correctly", async () => {
    const { id } = await makePaste({ content: "twice", max_views: 2 });
    const a = await (await getPaste(id)).json();
    const b = await (await getPaste(id)).json();
    expect([a.remaining_views, b.remaining_views]).toEqual([1, 0]);
    expect((await getPaste(id)).status).toBe(404);
  });

  it("keeps returning 404 once exhausted and never goes negative", async () => {
    const { id } = await makePaste({ content: "x", max_views: 1 });
    await getPaste(id);
    for (let i = 0; i < 5; i++) {
      const res = await getPaste(id);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/application\/json/);
      expect(await res.json()).not.toHaveProperty("remaining_views");
    }
    expect((await viewPaste(id)).status).toBe(404);
  });

  it("counts HTML views against the same limit as API fetches", async () => {
    const { id } = await makePaste({ content: "shared budget", max_views: 2 });
    expect((await viewPaste(id)).status).toBe(200);
    const api = await (await getPaste(id)).json();
    expect(api.remaining_views).toBe(0);
    expect((await viewPaste(id)).status).toBe(404);
  });

  it("cannot exceed the limit under concurrent load", async () => {
    const limit = 5;
    const { id } = await makePaste({ content: "race", max_views: limit });
    const responses = await Promise.all(Array.from({ length: 40 }, () => getPaste(id)));
    const ok = responses.filter((r) => r.status === 200);
    const gone = responses.filter((r) => r.status === 404);
    expect(ok.length).toBe(limit);
    expect(gone.length).toBe(40 - limit);
    const remaining = (await Promise.all(ok.map((r) => r.json()))).map((d) => d.remaining_views as number);
    expect(remaining.every((n) => n >= 0)).toBe(true);
    expect(new Set(remaining).size).toBe(limit); // each success saw a distinct count: 4,3,2,1,0
  });

  it("max_views=1 under concurrency: exactly one request gets the paste", async () => {
    const { id } = await makePaste({ content: "last view", max_views: 1 });
    const responses = await Promise.all(Array.from({ length: 30 }, () => getPaste(id)));
    expect(responses.filter((r) => r.status === 200).length).toBe(1);
    expect(responses.filter((r) => r.status === 404).length).toBe(29);
  });

  it("concurrent mix of API and HTML requests still respects the limit", async () => {
    const limit = 3;
    const { id } = await makePaste({ content: "mixed", max_views: limit });
    const calls = Array.from({ length: 24 }, (_, i) => (i % 2 ? getPaste(id) : viewPaste(id)));
    const responses = await Promise.all(calls);
    expect(responses.filter((r) => r.status === 200).length).toBe(limit);
  });
});

describe("expiry (TEST_MODE=1 + x-test-now-ms)", () => {
  it("is available before expiry and 404 at/after expiry", async () => {
    const { id } = await makePaste({ content: "ttl", ttl_seconds: 60 }, { "x-test-now-ms": String(T0) });
    const before = await getPaste(id, { "x-test-now-ms": String(T0 + 59_999) });
    expect(before.status).toBe(200);
    expect((await before.json()).expires_at).toBe(new Date(T0 + 60_000).toISOString());
    expect((await getPaste(id, { "x-test-now-ms": String(T0 + 60_000) })).status).toBe(404);
    expect((await getPaste(id, { "x-test-now-ms": String(T0 + 120_000) })).status).toBe(404);
  });

  it("applies the same expiry to the HTML page", async () => {
    const { id } = await makePaste({ content: "ttl html", ttl_seconds: 10 }, { "x-test-now-ms": String(T0) });
    expect((await viewPaste(id, { "x-test-now-ms": String(T0 + 5_000) })).status).toBe(200);
    expect((await viewPaste(id, { "x-test-now-ms": String(T0 + 10_000) })).status).toBe(404);
  });

  it("expired paste stays 404 and does not consume views", async () => {
    const { id } = await makePaste({ content: "x", ttl_seconds: 5, max_views: 3 }, { "x-test-now-ms": String(T0) });
    for (let i = 0; i < 3; i++) {
      const res = await getPaste(id, { "x-test-now-ms": String(T0 + 6_000) });
      expect(res.status).toBe(404);
    }
    // Going back in (fake) time proves the 404s above consumed nothing.
    const res = await getPaste(id, { "x-test-now-ms": String(T0 + 1_000) });
    expect(res.status).toBe(200);
    expect((await res.json()).remaining_views).toBe(2);
  });

  it("TTL + max_views: view limit triggers first", async () => {
    const h = { "x-test-now-ms": String(T0) };
    const { id } = await makePaste({ content: "both", ttl_seconds: 600, max_views: 2 }, h);
    expect((await getPaste(id, h)).status).toBe(200);
    expect((await getPaste(id, h)).status).toBe(200);
    expect((await getPaste(id, h)).status).toBe(404);
  });

  it("TTL + max_views: TTL triggers first", async () => {
    const { id } = await makePaste({ content: "both", ttl_seconds: 30, max_views: 10 }, { "x-test-now-ms": String(T0) });
    expect((await getPaste(id, { "x-test-now-ms": String(T0 + 1_000) })).status).toBe(200);
    expect((await getPaste(id, { "x-test-now-ms": String(T0 + 31_000) })).status).toBe(404);
  });

  it("uses real time when the header is absent", async () => {
    const { id } = await makePaste({ content: "real clock", ttl_seconds: 3600 });
    const data = await (await getPaste(id)).json();
    const exp = Date.parse(data.expires_at);
    expect(exp).toBeGreaterThan(Date.now() + 3_500_000);
    expect(exp).toBeLessThan(Date.now() + 3_700_000);
  });
});

describe("hostile x-test-now-ms headers (TEST_MODE=1)", () => {
  it.each(["9".repeat(400), "9".repeat(25), "9007199254740993", "8640000000000001", "abc", "-1", "1.5"])(
    "do not break create or fetch: %s",
    async (value) => {
      const h = { "x-test-now-ms": value };
      const created = await createPaste({ content: "x", ttl_seconds: 60, max_views: 2 }, h);
      expect(created.status).toBe(201); // header ignored -> real clock, not a bogus "ttl too large"
      const { id } = await created.json();
      const res = await getPaste(id, h);
      expect(res.status).toBe(200);
      const exp = Date.parse((await res.json()).expires_at);
      expect(exp).toBeGreaterThan(Date.now() + 50_000);
      expect(exp).toBeLessThan(Date.now() + 70_000);
    }
  );
});

describe("public url generation", () => {
  const post = (host: string) =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: PORTS.app, path: "/api/pastes", method: "POST", headers: { host, "content-type": "application/json" } },
        (res) => {
          let raw = "";
          res.on("data", (d) => (raw += d));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }));
        }
      );
      req.on("error", reject);
      req.end(JSON.stringify({ content: "x" }));
    });

  it("uses the Host the client called, with /p/:id", async () => {
    const { body } = await post("paste.example.com");
    expect(body.url).toBe(`http://paste.example.com/p/${body.id}`);
  });

  it("does not echo a malformed Host header", async () => {
    const { status, body } = await post("evil.com/x");
    expect(status).toBe(201);
    expect(body.url).not.toContain("evil.com");
    expect(body.url).toMatch(new RegExp(`^http://[A-Za-z0-9.:-]+/p/${body.id}$`));
  });
});

describe("browser rendering (/p/:id)", () => {
  it("returns HTML containing the paste", async () => {
    const { id } = await makePaste({ content: "visible text" });
    const res = await viewPaste(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain("visible text");
  });

  it("escapes HTML/JS so nothing user-supplied can execute", async () => {
    const payload = `<script>window.__pwned=1</script><img src=x onerror="alert(1)"><a href="javascript:alert(2)">x</a>`;
    const { id } = await makePaste({ content: payload });
    const html = await (await viewPaste(id)).text();
    expect(html).not.toContain("<script>window.__pwned");
    expect(html).not.toContain('<img src=x onerror');
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain("&lt;script&gt;window.__pwned=1&lt;/script&gt;");
  });

  it("returns 404 HTML for missing pastes", async () => {
    const res = await viewPaste("doesnotexist123");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain("Paste unavailable");
  });

  it("serves the create page", async () => {
    const res = await fetch(`${APP_URL}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Create paste");
  });
});
