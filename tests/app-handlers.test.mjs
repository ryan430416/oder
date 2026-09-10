import test from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../js/order-status.js";
import { moneyInt, isServicePickupTime, pickupIsWithinOrderWindow } from "../server/app-handlers.js";
import { sanitizePocketBaseUrl } from "../js/config.js";
import { COLLECTION_RULES } from "../pocketbase/collection-rules.js";

test("order totals only accept whole numbers and ignore client totals", () => {
  assert.equal(moneyInt(35), 35);
  assert.equal(moneyInt("40"), 40);
  assert.equal(moneyInt(12.5), null);
  assert.equal(moneyInt(-1), null);
});

test("pickup windows stay time-only school slots", () => {
  const pickup = new Date("2026-09-11T00:35:00.000Z");
  assert.equal(isServicePickupTime(pickup), true);
  const now = new Date("2026-09-10T16:00:00.000Z");
  assert.equal(pickupIsWithinOrderWindow(pickup, now), true);
});

test("order status cannot skip or reverse", () => {
  assert.equal(canTransition("pending", "accepted"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  assert.equal(canTransition("pending", "completed"), false);
  assert.equal(canTransition("ready", "preparing"), false);
  assert.equal(canTransition("completed", "pending"), false);
});

test("HTTPS pages reject HTTP PocketBase URLs", () => {
  assert.equal(sanitizePocketBaseUrl("https://db.keson.pro/"), "https://db.keson.pro");
  assert.equal(sanitizePocketBaseUrl("javascript:alert(1)"), "");
  const previous = globalThis.location;
  globalThis.location = { protocol: "https:" };
  try {
    assert.equal(sanitizePocketBaseUrl("http://127.0.0.1:8090"), "");
  } finally {
    if (previous) globalThis.location = previous;
    else delete globalThis.location;
  }
});

test("orders and order_items cannot be written by collection rules", () => {
  assert.equal(COLLECTION_RULES.orders.createRule, null);
  assert.equal(COLLECTION_RULES.orders.updateRule, null);
  assert.equal(COLLECTION_RULES.order_items.createRule, null);
  assert.equal(COLLECTION_RULES.oder_users.updateRule.includes("admin"), true);
  assert.match(COLLECTION_RULES.products.updateRule, /@request\.body\.store:isset = false/);
});
