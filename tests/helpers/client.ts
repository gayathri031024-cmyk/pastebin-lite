import { APP_URL } from "../config";

export async function createPaste(body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${APP_URL}/api/pastes`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function makePaste(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await createPaste(body, headers);
  if (res.status >= 300) throw new Error(`create failed: ${res.status}`);
  return (await res.json()) as { id: string; url: string };
}

export const getPaste = (id: string, headers: Record<string, string> = {}) =>
  fetch(`${APP_URL}/api/pastes/${id}`, { headers });

export const viewPaste = (id: string, headers: Record<string, string> = {}) =>
  fetch(`${APP_URL}/p/${id}`, { headers });
