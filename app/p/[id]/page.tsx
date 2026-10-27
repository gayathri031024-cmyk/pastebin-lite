import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { consumePaste } from "@/lib/paste";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function PastePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paste = await consumePaste(id, nowMs(await headers()));
  if (!paste) notFound();

  return (
    <div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#f5f5f5",
          padding: 16,
          borderRadius: 6,
        }}
      >
        {paste.content}
      </pre>
      <p style={{ color: "#555", fontSize: 14 }}>
        {paste.remaining_views !== null && <>Remaining views: {paste.remaining_views}. </>}
        {paste.expires_at && <>Expires at: {paste.expires_at}.</>}
      </p>
    </div>
  );
}
