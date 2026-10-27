// Minimal stand-in for Upstash's REST API in front of a REAL local Redis.
// The app uses the real @upstash/redis client; Lua scripts run in real Redis.
import http from "node:http";
import Redis from "ioredis";
import { TOKEN } from "../config";

type Reply = string | number | null | Reply[];

function encode(v: unknown): unknown {
  if (typeof v === "string") return Buffer.from(v, "utf8").toString("base64");
  if (Array.isArray(v)) return v.map(encode);
  return v;
}

export function startProxy(redisPort: number, port: number) {
  const redis = new Redis({ port: redisPort, lazyConnect: false });
  let failing = false;

  const run = async (cmd: unknown[]): Promise<Reply> => {
    const [name, ...args] = cmd.map(String);
    return (await redis.call(name, ...args)) as Reply;
  };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // Test control switch: simulate the storage layer going down.
    if (req.url === "/__control") {
      failing = JSON.parse(raw).fail === true;
      return send(200, { failing });
    }
    if (failing) return send(500, { error: "simulated outage" });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(401, { error: "Unauthorized" });
    }

    const base64 = req.headers["upstash-encoding"] === "base64";
    const out = (v: unknown) => (base64 ? encode(v) : v);
    try {
      const body = JSON.parse(raw);
      if (req.url?.startsWith("/pipeline") || req.url?.startsWith("/multi-exec")) {
        const results = [];
        for (const cmd of body as unknown[][]) {
          try {
            results.push({ result: out(await run(cmd)) });
          } catch (e) {
            results.push({ error: (e as Error).message });
          }
        }
        return send(200, results);
      }
      send(200, { result: out(await run(body)) });
    } catch (e) {
      send(400, { error: (e as Error).message });
    }
  });

  return new Promise<{ close: () => Promise<void> }>((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        close: async () => {
          server.close();
          redis.disconnect();
        },
      })
    );
  });
}
