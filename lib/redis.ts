import { Redis } from "@upstash/redis";

export class StorageError extends Error {}

// Builds a stateless REST client on every call (no connection to keep alive,
// so there is nothing worth caching in a serverless function).
export function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new StorageError("Redis environment variables are not configured");
  }
  return new Redis({
    url,
    token,
    // Paste content must come back byte-for-byte. With the default (true) the
    // client JSON-parses replies, so a paste like {"a":1} or 12345 would be
    // returned as an object/number instead of the original text.
    automaticDeserialization: false,
    retry: { retries: 1, backoff: () => 100 },
  });
}
