"use client";

import { useState } from "react";

export default function Home() {
  const [content, setContent] = useState("");
  const [ttl, setTtl] = useState("");
  const [maxViews, setMaxViews] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUrl(null);
    setCopied(false);
    const payload: Record<string, unknown> = { content };
    if (ttl.trim() !== "") payload.ttl_seconds = Number(ttl);
    if (maxViews.trim() !== "") payload.max_views = Number(maxViews);
    setLoading(true);
    try {
      const res = await fetch("/api/pastes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong");
      else setUrl(data.url);
    } catch {
      setError("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy automatically, please copy the link manually");
    }
  }

  const field = { display: "block", width: "100%", marginTop: 4, padding: 8, boxSizing: "border-box" as const };

  return (
    <form onSubmit={submit}>
      <label>
        Paste content
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          style={{ ...field, fontFamily: "monospace" }}
        />
      </label>
      <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
        <label style={{ flex: 1 }}>
          Expire after (seconds, optional)
          <input type="number" min={1} step={1} value={ttl} onChange={(e) => setTtl(e.target.value)} style={field} />
        </label>
        <label style={{ flex: 1 }}>
          Max views (optional)
          <input type="number" min={1} step={1} value={maxViews} onChange={(e) => setMaxViews(e.target.value)} style={field} />
        </label>
      </div>
      <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
        {loading ? "Creating..." : "Create paste"}
      </button>
      {error && (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      )}
      {url && (
        <p>
          Shareable link: <a href={url}>{url}</a>{" "}
          <button type="button" onClick={copyLink}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </p>
      )}
    </form>
  );
}
