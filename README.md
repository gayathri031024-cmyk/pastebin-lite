
# Pastebin Lite

A lightweight Pastebin-like web application built with Next.js, TypeScript, and Upstash Redis. Create text pastes and share them through unique URLs, with optional expiration times and view limits.

**Live Demo:** https://pastebin-lite-rgz7.vercel.app
**GitHub Repository:** https://github.com/gayathri031024-cmyk/pastebin-lite

## Features

* Create text pastes and generate shareable links.
* Set optional expiration times and maximum view counts.
* Persist paste data in Upstash Redis.
* Enforce view limits atomically to handle concurrent requests.
* Render paste content safely as escaped text.
* Validate API input and return appropriate HTTP status codes.
* Support deterministic expiration testing through `TEST_MODE`.
* Include automated integration and unit tests.

## API Overview

| Method | Endpoint          | Description                                           |
| ------ | ----------------- | ----------------------------------------------------- |
| `GET`  | `/api/healthz`    | Checks Redis connectivity.                            |
| `POST` | `/api/pastes`     | Creates a paste and returns its ID and share URL.     |
| `GET`  | `/api/pastes/:id` | Retrieves paste content and its remaining view count. |
| `GET`  | `/p/:id`          | Displays a paste in the browser.                      |

Pastes can become unavailable when their expiration time passes or their view limit is exhausted.

A small Pastebin-like web app. Create a text paste, get a shareable link, and view it until it expires (time limit) or runs out of views (view limit).

## Features and API

| Route | Purpose |
| --- | --- |
| `GET /api/healthz` | Checks the persistence layer with a real Redis `PING`. `200 {"ok":true}` when healthy, `503 {"ok":false,"error":...}` otherwise. |
| `POST /api/pastes` | Body `{ "content": string, "ttl_seconds"?: int >= 1, "max_views"?: int >= 1 }`. Returns `201 { "id", "url" }`. Invalid input returns `400` (`413` if content > 512 KB) with a JSON `error`. |
| `GET /api/pastes/:id` | Returns `{ "content", "remaining_views", "expires_at" }` (`null` when unlimited). Each successful fetch counts as one view. Missing, expired or exhausted pastes return `404` JSON. |
| `GET /p/:id` | HTML view of a paste (also counts as one view). `404` page if unavailable. |

The UI (`/`) lets you enter text, optionally set an expiry and a view limit, create the paste, and copy the link. Errors are shown inline.

## Tech stack

Next.js 15 (App Router) + React 19 + TypeScript, Upstash Redis (`@upstash/redis`), Vitest for tests.

## Run locally

1. Create a free Redis database at [Upstash](https://upstash.com) and copy its REST URL and token.
2. Copy `.env.example` to `.env.local` and fill in placeholders:
   ```
   UPSTASH_REDIS_REST_URL=https://<your-db>.upstash.io
   UPSTASH_REDIS_REST_TOKEN=<your-token>
   TEST_MODE=0
   ```
3. Install and start:
   ```bash
   npm ci               # or npm install
   npm run dev          # http://localhost:3000
   # or: npm run build && npm start
   ```

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | yes | `KV_REST_API_URL` / `KV_REST_API_TOKEN` (set by Vercel's Upstash integration) also work. Server-side only; never sent to the browser. |
| `TEST_MODE` | no | `1` makes the `x-test-now-ms` header the "current time" for expiry logic. Leave unset/`0` in normal use. |
| `APP_BASE_URL` | no | Pins the origin used in returned links (recommended in production, e.g. `https://your-app.vercel.app`). Must be an `http`/`https` origin only: no username/password, path, query string or fragment (trailing slashes are fine). An invalid value makes `POST /api/pastes` return `500 Server misconfigured` instead of producing wrong links. If unset, the request's `Host` header is used when it looks valid. |

## Tests

```bash
npm run typecheck
npm test        # builds the app, then runs all tests (~25 s)
```

The tests are integration tests against the real production build and a **real Redis**. They need the `redis-server` binary installed (`apt install redis-server` or `brew install redis`). The test setup starts a local Redis on port 6390, a tiny HTTP proxy that speaks Upstash's REST protocol in front of it, and the built app on ports 3100/3101. No Upstash account or credentials are needed to run them. They cover validation, view limits (including concurrent requests), TTL via `x-test-now-ms` (including malformed/huge header values), HTML escaping, share-URL generation, and behaviour when storage is down or unconfigured. Small unit tests cover the URL builder, the time helper and the health-check timer cleanup.

## Persistence

**Upstash Redis** over HTTPS, which suits serverless platforms where each request may hit a different instance (in-memory state would not survive). Each paste is a Redis hash: `content`, `max_views`, `views`, `expires_at` (`-1` means "no limit"). No migrations or setup scripts are needed. Keys of TTL pastes also get a native Redis `EXPIRE` (TTL + 1 hour) to reclaim storage.

## Design decisions and trade-offs

- **Atomic view counting:** a single Redis Lua script checks expiry, checks the view limit and increments the counter in one step. Redis runs scripts one at a time, so concurrent requests cannot both take the last view and `remaining_views` never goes negative.
- **Deterministic time:** only when `TEST_MODE=1`, `x-test-now-ms` replaces the current time for expiry checks (creation, API fetch and HTML view). The header must be a plain integer within the range a JavaScript `Date` supports; anything else (letters, decimals, huge numbers) is ignored and the system clock is used. Without `TEST_MODE=1` the header is always ignored.
- **Safe rendering:** content is rendered by React as escaped text inside `<pre>`; the app never uses `dangerouslySetInnerHTML`.
- **Exact content round-trip:** the Redis client's automatic JSON parsing is disabled so a paste like `{"a":1}` is returned as the same text, not an object.
- **Validation:** `ttl_seconds` / `max_views` must be safe integers >= 1; `null`, strings, decimals, zero and negatives are rejected. A TTL too large to represent as a date is rejected.
- **Links:** the returned URL uses `APP_BASE_URL` if set, otherwise the `Host` header if it looks like a valid host[:port]; `X-Forwarded-*` headers are not trusted. A client could still send a syntactically valid but fake `Host`, so set `APP_BASE_URL` in production to remove that possibility. There are no hardcoded localhost URLs.
- **Errors:** storage failures or missing configuration return `503` JSON without internal details; details are logged server-side only.
- **Trade-off:** HTML page views and API fetches share the same view budget, so link-preview bots that open a link can consume a view.
- **Trade-off:** IDs are 96 random bits (16 URL-safe characters); there is no explicit collision check because collisions are not practically possible.

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel.
2. Add the Upstash Redis integration (Marketplace), or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` manually.
3. Set `APP_BASE_URL` to your production URL (after the first deploy you will know it; redeploy once).
4. If an automated grader needs the time header, set `TEST_MODE=1`.
5. Deploy, then check `https://<your-app>.vercel.app/api/healthz` returns `{"ok":true}`.
