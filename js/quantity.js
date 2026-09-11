/** Shared cart / order quantity rules: integers 1–99 only. */

export const QTY_MIN = 1;
export const QTY_MAX = 99;

/**
 * Parse a quantity from user input.
 * Empty string → `{ ok: false, empty: true }` (do not mutate cart while typing).
 * Non-digits, decimals, signs, scientific notation → reject.
 * With `clamp: true`, values outside 1–99 are corrected to the nearest bound.
 */
export function parseCartQuantity(raw, { clamp = true } = {}) {
  if (raw === "" || raw == null) return { ok: false, empty: true };
  const text = String(raw).trim();
  if (text === "") return { ok: false, empty: true };
  if (!/^\d+$/.test(text)) return { ok: false, code: "INVALID_QUANTITY" };
  const n = Number(text);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, code: "INVALID_QUANTITY" };
  }
  if (clamp) {
    const value = Math.min(QTY_MAX, Math.max(QTY_MIN, n));
    return { ok: true, value, clamped: value !== n };
  }
  if (n < QTY_MIN || n > QTY_MAX) return { ok: false, code: "INVALID_QUANTITY" };
  return { ok: true, value: n, clamped: false };
}

/**
 * Strict quantity for checkout / PocketBase create-order.
 * Accepts only finite integers in 1–99 (number or digit-only string). Rejects
 * Infinity, NaN, floats, negatives, scientific notation strings, and out-of-range.
 */
export function parseOrderQuantity(raw) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < QTY_MIN || raw > QTY_MAX) {
      return null;
    }
    return raw;
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < QTY_MIN || n > QTY_MAX) return null;
    return n;
  }
  return null;
}
