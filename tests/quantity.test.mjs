import test from "node:test";
import assert from "node:assert/strict";
import { parseCartQuantity, parseOrderQuantity, QTY_MAX, QTY_MIN } from "../js/quantity.js";

test("parseCartQuantity clamps 0 and 100 and keeps 1–99", () => {
  assert.deepEqual(parseCartQuantity("0"), { ok: true, value: 1, clamped: true });
  assert.deepEqual(parseCartQuantity("1"), { ok: true, value: 1, clamped: false });
  assert.deepEqual(parseCartQuantity("99"), { ok: true, value: 99, clamped: false });
  assert.deepEqual(parseCartQuantity("100"), { ok: true, value: 99, clamped: true });
  assert.equal(QTY_MIN, 1);
  assert.equal(QTY_MAX, 99);
});

test("parseCartQuantity rejects blank, decimal, negative, scientific, and non-numeric", () => {
  assert.equal(parseCartQuantity("").empty, true);
  assert.equal(parseCartQuantity("   ").empty, true);
  assert.equal(parseCartQuantity("1.5").ok, false);
  assert.equal(parseCartQuantity("-1").ok, false);
  assert.equal(parseCartQuantity("1e2").ok, false);
  assert.equal(parseCartQuantity("abc").ok, false);
  assert.equal(parseCartQuantity("Infinity").ok, false);
  assert.equal(parseCartQuantity(NaN).ok, false);
});

test("parseOrderQuantity rejects out-of-range and non-integers without clamping", () => {
  assert.equal(parseOrderQuantity(1), 1);
  assert.equal(parseOrderQuantity(99), 99);
  assert.equal(parseOrderQuantity(100), null);
  assert.equal(parseOrderQuantity(0), null);
  assert.equal(parseOrderQuantity(1.5), null);
  assert.equal(parseOrderQuantity(-3), null);
  assert.equal(parseOrderQuantity(Infinity), null);
  assert.equal(parseOrderQuantity(NaN), null);
  assert.equal(parseOrderQuantity("100"), null);
  assert.equal(parseOrderQuantity("1e2"), null);
  assert.equal(parseOrderQuantity(" 42 "), 42);
  assert.equal(parseOrderQuantity(""), null);
});
