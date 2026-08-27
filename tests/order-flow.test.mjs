import test from "node:test";
import assert from "node:assert/strict";

import { isPickupTimeAllowed, pickupSlotsForStore } from "../js/format.js";
import { escapeHtml } from "../js/html.js";

const localDate = (hour, minute) => new Date(2026, 7, 27, hour, minute, 0, 0);

test("HTML escaping neutralizes stored markup", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
});

test("pickup slots respect store hours and closed status", () => {
  const dayStore = { status: "open", open_time: "10:00", close_time: "20:00" };
  const overnightStore = { status: "open", open_time: "18:00", close_time: "02:00" };

  assert.equal(pickupSlotsForStore(dayStore, localDate(9, 0))[0].label, "10:00");
  assert.equal(pickupSlotsForStore(dayStore, localDate(19, 40)).length, 0);
  assert.equal(pickupSlotsForStore({ ...dayStore, status: "closed" }, localDate(9, 0)).length, 0);
  assert.equal(pickupSlotsForStore(overnightStore, localDate(23, 0))[0].label, "23:15");
  assert.equal(isPickupTimeAllowed(dayStore, localDate(10, 30).toISOString(), localDate(9, 0)), true);
  assert.equal(isPickupTimeAllowed(dayStore, localDate(21, 0).toISOString(), localDate(9, 0)), false);
});

test("order creation recalculates totals and rejects forged items", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  globalThis.BroadcastChannel = class {
    postMessage() {}
  };

  const { auth } = await import("../js/auth.js");
  const { api } = await import("../js/api.js");

  const now = new Date();
  const timeAtOffset = (minutes) => {
    const value = new Date(now.getTime() + minutes * 60 * 1000);
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  };

  assert.equal(auth.login("admin", "1234").ok, true);
  const storeResult = await api.createStore({
    store_name: "Test store",
    username: "test_store",
    password: "1234",
    open_time: timeAtOffset(-60),
    close_time: timeAtOffset(180),
    status: "open",
  });
  assert.equal(storeResult.ok, true);

  const productResult = await api.createProduct({
    store_id: storeResult.store.store_id,
    product_name: "Test meal",
    price: "50",
    status: "active",
  });
  assert.equal(productResult.ok, true);

  const pickup = pickupSlotsForStore(storeResult.store)[0];
  assert.ok(pickup);
  const orderResult = await api.createOrder({
    customer_id: "test_customer",
    customer_name: "Tester",
    store_id: storeResult.store.store_id,
    pickup_time: pickup.value,
    payment_method: "cash",
    items: [{ product_id: productResult.product.product_id, quantity: 2, unit_price: -999 }],
  });
  assert.equal(orderResult.ok, true);
  assert.equal(orderResult.order.total, 100);

  const forged = await api.createOrder({
    customer_id: "test_customer",
    customer_name: "Tester",
    store_id: storeResult.store.store_id,
    pickup_time: pickup.value,
    payment_method: "cash",
    items: [{ product_id: "missing", quantity: -1, unit_price: -999 }],
  });
  assert.deepEqual(forged, { ok: false, code: "invalid_items" });

  assert.equal(auth.login("test_store", "1234").ok, true);
  const invalidTransition = await api.updateOrderStatus(orderResult.order.order_id, "completed");
  assert.equal(invalidTransition.ok, false);
  assert.equal(invalidTransition.code, "invalid_status");
  assert.equal((await api.updateOrderStatus(orderResult.order.order_id, "accepted")).ok, true);
});
