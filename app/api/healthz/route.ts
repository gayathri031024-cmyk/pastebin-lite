import { NextResponse } from "next/server";
import { pingStore } from "@/lib/paste";

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await pingStore();
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json(
        { ok: false, error: "Storage unavailable" },
        { status: 503 }
      );
}
