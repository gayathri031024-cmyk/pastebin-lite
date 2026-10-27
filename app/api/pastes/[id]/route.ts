import { NextRequest, NextResponse } from "next/server";
import { consumePaste } from "@/lib/paste";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const paste = await consumePaste(id, nowMs(req.headers));
    if (!paste) {
      return NextResponse.json({ error: "Paste not found" }, { status: 404 });
    }
    return NextResponse.json(paste);
  } catch (err) {
    console.error("fetch paste failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }
}
