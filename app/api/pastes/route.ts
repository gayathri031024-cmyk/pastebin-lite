import { NextRequest, NextResponse } from "next/server";
import { createPaste } from "@/lib/paste";
import { MAX_DATE_MS, nowMs } from "@/lib/time";
import { buildPasteUrl, buildPublicOrigin } from "@/lib/url";

export const dynamic = "force-dynamic";

const MAX_CONTENT_BYTES = 512 * 1024;

const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });

// Optional field: omitted -> null (no limit). Anything else must be a safe integer >= 1.
function optionalPositiveInt(v: unknown): number | null | "invalid" {
  if (v === undefined) return null;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) {
    return "invalid";
  }
  return v;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return bad("Request body must be a JSON object");
  }
  const { content, ttl_seconds, max_views } = body as Record<string, unknown>;

  if (typeof content !== "string" || content.trim().length === 0) {
    return bad("content is required and must be a non-empty string");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    return bad("content is too large (max 512 KB)", 413);
  }
  const ttl = optionalPositiveInt(ttl_seconds);
  if (ttl === "invalid") return bad("ttl_seconds must be an integer >= 1");
  const max = optionalPositiveInt(max_views);
  if (max === "invalid") return bad("max_views must be an integer >= 1");

  const now = nowMs(req.headers);
  if (ttl !== null && now + ttl * 1000 > MAX_DATE_MS) {
    return bad("ttl_seconds is too large");
  }

  // Work out the share-link origin first, so a bad APP_BASE_URL fails the
  // request before anything is saved (no orphaned paste).
  let origin: string;
  try {
    origin = buildPublicOrigin({
      appBaseUrl: process.env.APP_BASE_URL,
      host: req.headers.get("host"),
      protocol: req.nextUrl.protocol,
      fallbackOrigin: req.nextUrl.origin,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return bad("Server misconfigured", 500);
  }

  try {
    const id = await createPaste(content, ttl, max, now);
    return NextResponse.json({ id, url: buildPasteUrl(origin, id) }, { status: 201 });
  } catch (err) {
    console.error("create paste failed:", err instanceof Error ? err.message : err);
    return bad("Storage unavailable", 503);
  }
}
