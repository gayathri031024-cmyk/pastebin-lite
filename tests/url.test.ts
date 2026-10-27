import { describe, expect, it } from "vitest";
import { buildPasteUrl, buildPublicOrigin, InvalidAppBaseUrlError, parseAppBaseUrl } from "../lib/url";

const base = { host: "app.example.com", protocol: "https:", fallbackOrigin: "http://fallback.test" };

describe("buildPublicOrigin", () => {
  it("prefers APP_BASE_URL and strips trailing slashes", () => {
    expect(buildPublicOrigin({ ...base, appBaseUrl: "https://pinned.example.com//" })).toBe("https://pinned.example.com");
  });

  it("ignores an empty APP_BASE_URL", () => {
    expect(buildPublicOrigin({ ...base, appBaseUrl: "  " })).toBe("https://app.example.com");
  });

  it("uses the Host header and request protocol when nothing is pinned", () => {
    expect(buildPublicOrigin(base)).toBe("https://app.example.com");
    expect(buildPublicOrigin({ ...base, host: "localhost:3000", protocol: "http:" })).toBe("http://localhost:3000");
    expect(buildPublicOrigin({ ...base, host: "[::1]:3000", protocol: "http:" })).toBe("http://[::1]:3000");
  });

  it.each(["evil.com/path", "a b", "evil.com@x", "x.com\r\nSet-Cookie: a=b", "", "host:99999999", "host:65536"])(
    "falls back when Host looks malformed: %j",
    (host) => {
      expect(buildPublicOrigin({ ...base, host })).toBe("http://fallback.test");
    }
  );

  it("accepts the highest valid port in the Host header", () => {
    expect(buildPublicOrigin({ ...base, host: "localhost:65535", protocol: "http:" })).toBe("http://localhost:65535");
  });

  it("falls back when there is no Host header", () => {
    expect(buildPublicOrigin({ ...base, host: null })).toBe("http://fallback.test");
  });

  it("throws (instead of using the Host header) when APP_BASE_URL is invalid", () => {
    expect(() => buildPublicOrigin({ ...base, appBaseUrl: "not a url" })).toThrow(InvalidAppBaseUrlError);
    expect(() => buildPublicOrigin({ ...base, appBaseUrl: "https://example.com/app" })).toThrow(InvalidAppBaseUrlError);
  });
});

describe("parseAppBaseUrl: valid values", () => {
  it.each([
    ["https://app.vercel.app", "https://app.vercel.app"],
    ["https://app.vercel.app/", "https://app.vercel.app"],
    ["  https://app.vercel.app  ", "https://app.vercel.app"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3000/", "http://127.0.0.1:3000"],
    ["http://[::1]:3000", "http://[::1]:3000"],
    ["https://paste.example.com:8443", "https://paste.example.com:8443"],
    ["HTTPS://App.Example.COM", "https://app.example.com"], // normalised to lower case
    ["https://example.com:443", "https://example.com"], // default port dropped
  ])("accepts %j", (input, expected) => {
    expect(parseAppBaseUrl(input)).toBe(expected);
  });
});

describe("parseAppBaseUrl: malformed URLs", () => {
  it.each(["", "example.com", "//example.com", "https://", "https:///", "http://[::1", "http://exa mple.com", "just text"])(
    "rejects %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(InvalidAppBaseUrlError);
    }
  );
});

describe("parseAppBaseUrl: unsupported protocols", () => {
  it.each(["ftp://example.com", "javascript:alert(1)", "file:///etc/passwd", "ws://example.com", "data:text/html,hi"])(
    "rejects %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(/http or https/);
    }
  );
});

describe("parseAppBaseUrl: invalid hosts and ports", () => {
  it.each(["https://exa mple.com", "https://exa<mple.com", "https://example.com:99999", "https://example.com:abc", "https://[::1"])(
    "rejects %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(InvalidAppBaseUrlError);
    }
  );

  it("rejects whitespace/line breaks that new URL() would silently strip", () => {
    expect(() => parseAppBaseUrl("https://exam\nple.com")).toThrow(InvalidAppBaseUrlError);
    expect(() => parseAppBaseUrl("https://example.com\r\nX-Evil: 1")).toThrow(InvalidAppBaseUrlError);
  });
});

describe("parseAppBaseUrl: unexpected URL parts", () => {
  it.each(["https://user@example.com", "https://user:pass@example.com", "https://:pass@example.com"])(
    "rejects credentials in %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(/username or password/);
    }
  );

  it.each(["https://example.com/app", "https://example.com/p/abc", "https://example.com/a/"])(
    "rejects a path in %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(/no path/);
    }
  );

  it("treats a bare root path (even with extra slashes) as the origin", () => {
    expect(parseAppBaseUrl("https://example.com/")).toBe("https://example.com");
    expect(parseAppBaseUrl("https://example.com///")).toBe("https://example.com");
  });

  it.each(["https://example.com?x=1", "https://example.com/?x=1", "https://example.com?", "https://example.com#top", "https://example.com/#", "https://example.com/?a#b"])(
    "rejects a query string or fragment in %j",
    (input) => {
      expect(() => parseAppBaseUrl(input)).toThrow(/query string or fragment/);
    }
  );
});

describe("buildPasteUrl", () => {
  it("points to /p/:id on the given origin", () => {
    expect(buildPasteUrl("https://app.example.com", "abc_DEF-123")).toBe("https://app.example.com/p/abc_DEF-123");
    expect(buildPasteUrl("http://localhost:3000", "xyz")).toBe("http://localhost:3000/p/xyz");
  });

  it("encodes unexpected characters in the id so the path cannot be changed", () => {
    expect(buildPasteUrl("https://app.example.com", "a/b?c#d")).toBe("https://app.example.com/p/a%2Fb%3Fc%23d");
  });
});
