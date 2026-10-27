import { randomBytes } from "node:crypto";
import { getRedis, StorageError } from "./redis";

export type Paste = {
  content: string;
  remaining_views: number | null;
  expires_at: string | null;
};

const key = (id: string) => `paste:${id}`;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_REDIS_EXPIRE_SECONDS = 2_147_483_647;

// Runs inside Redis as one atomic step: check expiry, check view limit, then
// increment. Two concurrent requests can never both take the last view.
// Returns nil when the paste is missing, expired, or out of views.
// max_views / expires_at are stored as strings and "-1" means "no limit".
const CONSUME_SCRIPT = `
local d = redis.call('HMGET', KEYS[1], 'content', 'max_views', 'views', 'expires_at')
if not d[1] then return nil end
local now = tonumber(ARGV[1])
local maxv = tonumber(d[2])
local views = tonumber(d[3])
local exp = tonumber(d[4])
if exp >= 0 and now >= exp then return nil end
if maxv >= 0 and views >= maxv then return nil end
local newViews = redis.call('HINCRBY', KEYS[1], 'views', 1)
return {d[1], d[2], newViews, d[4]}
`;

export async function createPaste(
  content: string,
  ttlSeconds: number | null,
  maxViews: number | null,
  now: number
): Promise<string> {
  const redis = getRedis();
  // 96 bits of randomness: collisions are not a practical concern.
  const id = randomBytes(12).toString("base64url");
  const expiresAt = ttlSeconds !== null ? now + ttlSeconds * 1000 : -1;
  const pipeline = redis.pipeline();
  pipeline.hset(key(id), {
    content,
    max_views: String(maxViews ?? -1),
    views: "0",
    expires_at: String(expiresAt),
  });
  if (ttlSeconds !== null) {
    // Storage cleanup only; logical expiry is enforced via expires_at.
    pipeline.expire(
      key(id),
      Math.min(ttlSeconds + 3600, MAX_REDIS_EXPIRE_SECONDS)
    );
  }
  await pipeline.exec();
  return id;
}

export async function consumePaste(
  id: string,
  now: number
): Promise<Paste | null> {
  if (!ID_PATTERN.test(id)) return null;
  const res = (await getRedis().eval(
    CONSUME_SCRIPT,
    [key(id)],
    [String(now)]
  )) as [string, string, number, string] | null;
  if (!res) return null;
  const [content, maxStr, views, expStr] = res;
  const max = Number(maxStr);
  const exp = Number(expStr);
  return {
    content: String(content),
    remaining_views: max >= 0 ? Math.max(0, max - Number(views)) : null,
    expires_at: exp >= 0 ? new Date(exp).toISOString() : null,
  };
}

// Real round-trip to the persistence layer, bounded so /api/healthz stays fast.
export async function pingStore(timeoutMs = 2000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const redis = getRedis();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StorageError("timeout")), timeoutMs);
    });
    const result = await Promise.race([redis.ping(), timeout]);
    return result === "PONG";
  } catch {
    return false;
  } finally {
    // Always stop the timer, otherwise it keeps running after a fast PING.
    clearTimeout(timer);
  }
}
