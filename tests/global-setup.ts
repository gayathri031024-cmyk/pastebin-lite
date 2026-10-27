// Starts: real redis-server -> Upstash-style REST proxy -> two production
// builds of the app (one configured, one with no storage env vars).
import { spawn, ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import { startProxy } from "./helpers/redis-http-proxy";
import { APP_NOENV_URL, APP_URL, PORTS, PROXY_URL, TOKEN } from "./config";

const nextBin = path.resolve("node_modules/next/dist/bin/next");

async function waitFor(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function startApp(port: number, env: Record<string, string>) {
  const cleanEnv = { ...process.env };
  for (const k of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "APP_BASE_URL",
    "TEST_MODE",
  ]) {
    delete cleanEnv[k];
  }
  // Run Next directly with node (not via npx) so killing this process really
  // stops the server; an npx wrapper would be killed and leave next-server behind.
  return spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    env: { ...cleanEnv, ...env },
    stdio: "ignore",
  });
}

export default async function setup() {
  if (!existsSync(".next")) {
    throw new Error("No production build found. Run `npm test` (it builds first) or `npm run build`.");
  }
  const procs: ChildProcess[] = [];

  const redisProc = spawn(
    "redis-server",
    ["--port", String(PORTS.redis), "--save", "", "--appendonly", "no", "--bind", "127.0.0.1"],
    { stdio: "ignore" }
  );
  procs.push(redisProc);
  await waitFor(async () => {
    const r = new Redis({ port: PORTS.redis, lazyConnect: true, retryStrategy: () => null });
    r.on("error", () => {}); // redis is still starting; the retry loop handles it
    try {
      await r.connect();
      return (await r.ping()) === "PONG";
    } finally {
      r.disconnect();
    }
  }, "redis-server (is it installed? try `apt install redis-server` or `brew install redis`)");

  const proxy = await startProxy(PORTS.redis, PORTS.proxy);

  procs.push(
    startApp(PORTS.app, {
      UPSTASH_REDIS_REST_URL: PROXY_URL,
      UPSTASH_REDIS_REST_TOKEN: TOKEN,
      TEST_MODE: "1",
    })
  );
  procs.push(startApp(PORTS.appNoEnv, { TEST_MODE: "1" }));

  await waitFor(async () => (await fetch(`${APP_URL}/api/healthz`)).status === 200, "app server");
  await waitFor(async () => (await fetch(`${APP_NOENV_URL}/api/healthz`)).status === 503, "no-env app server");

  return async () => {
    for (const p of procs) p.kill("SIGTERM");
    await proxy.close();
  };
}
