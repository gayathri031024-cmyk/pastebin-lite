// Largest timestamp a JS Date can represent.
export const MAX_DATE_MS = 8.64e15;

// Returns "now" in ms. With TEST_MODE=1 the x-test-now-ms header overrides it,
// but only if it is a plain non-negative integer that a Date can represent.
// Anything else (letters, decimals, huge numbers) is ignored and the real
// clock is used, so a bad header can never break the app.
export function nowMs(headers: Headers): number {
  if (process.env.TEST_MODE === "1") {
    const raw = headers.get("x-test-now-ms")?.trim();
    if (raw !== undefined && /^\d{1,16}$/.test(raw)) {
      const n = Number(raw);
      if (Number.isSafeInteger(n) && n <= MAX_DATE_MS) return n;
    }
  }
  return Date.now();
}
