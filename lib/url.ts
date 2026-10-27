// Builds the public origin (e.g. "https://app.vercel.app") used in share links.
//
// Order of preference:
//  1. APP_BASE_URL, if set. It must be a plain http(s) origin (see
//     parseAppBaseUrl). A bad value throws instead of being silently ignored,
//     so a typo in production is noticed straight away.
//  2. The Host header, but only if it looks like a real host[:port].
//  3. The origin Next.js worked out for the request.
// X-Forwarded-* headers are deliberately never trusted.

export class InvalidAppBaseUrlError extends Error {}

// A host[:port] such as "localhost:3000", "example.com" or "[::1]:3000".
const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-fA-F:]+\](:\d{1,5})?$/;

function hasValidPort(host: string): boolean {
  const port = host.match(/:(\d+)$/)?.[1];
  return port === undefined || Number(port) <= 65535;
}

// Checks APP_BASE_URL and returns it as a clean origin, e.g. "https://example.com".
// Accepted: http/https, a host, an optional port, and optional trailing slashes.
// Rejected: bad syntax, other protocols, user:password@, any path, ?query, #fragment.
export function parseAppBaseUrl(raw: string): string {
  const value = raw.trim();
  const fail = (reason: string): never => {
    throw new InvalidAppBaseUrlError(`APP_BASE_URL is invalid: ${reason}`);
  };

  // new URL() silently removes tabs/newlines, so look for whitespace ourselves.
  if (/\s/.test(value)) fail("it must not contain spaces or line breaks");
  // "https://a.com?" and "https://a.com#" parse with an empty query/fragment,
  // so check the raw text as well.
  if (value.includes("?") || value.includes("#")) fail("it must not contain a query string or fragment");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("it is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") fail("protocol must be http or https");
  if (url.username || url.password) fail("it must not contain a username or password");
  if (!/^\/*$/.test(url.pathname)) fail("it must be an origin only, with no path");
  if (!url.hostname) fail("it needs a host name");

  // url.origin is the normalised "protocol//host[:port]" (lower-case host,
  // default port removed). Everything else has been rejected above.
  return url.origin;
}

export function buildPublicOrigin(opts: {
  appBaseUrl?: string;
  host: string | null;
  protocol: string; // "http:" or "https:"
  fallbackOrigin: string;
}): string {
  const pinned = opts.appBaseUrl?.trim();
  if (pinned) return parseAppBaseUrl(pinned);
  if (opts.host && HOST_PATTERN.test(opts.host) && hasValidPort(opts.host)) {
    return `${opts.protocol}//${opts.host}`;
  }
  return opts.fallbackOrigin;
}

// The share link for a paste: always "<origin>/p/<id>".
export function buildPasteUrl(origin: string, id: string): string {
  return `${origin}/p/${encodeURIComponent(id)}`;
}
