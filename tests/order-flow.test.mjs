import test from "node:test";
import assert from "node:assert/strict";

import { isPickupTimeAllowed, pickupSlotsForStore } from "../js/format.js";
import { escapeHtml, productImageHtml } from "../js/html.js";
import {
  buildProductImagePath,
  detectImageMime,
  IMAGE_LIMITS,
  isValidProductImagePath,
} from "../js/product-image.js";
import { canCustomerCancel, canTransition } from "../js/order-status.js";
import { normalizeStoreImage, STORE_ICONS } from "../js/store-image.js";

const pad = (n) => String(n).padStart(2, "0");
const taipei = (hour, minute, day = 27) =>
  new Date(`2026-08-${pad(day)}T${pad(hour)}:${pad(minute)}:00+08:00`);
const localDate = (hour, minute) => new Date(2026, 7, 27, hour, minute, 0, 0);

test("HTML escaping and image rendering reject executable URLs", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
  const html = productImageHtml("javascript:alert(1)", "Meal");
  assert.match(html, /default-meal\.svg/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /src=""/);
});

test("store icons accept allowlisted emoji and https URLs only", () => {
  assert.equal(normalizeStoreImage("🍗"), "🍗");
  assert.equal(normalizeStoreImage("🏪"), "🏪");
  assert.equal(normalizeStoreImage("https://cdn.example/store.png"), "https://cdn.example/store.png");
  assert.equal(normalizeStoreImage("javascript:alert(1)"), null);
  assert.equal(normalizeStoreImage("<script>"), null);
  assert.ok(STORE_ICONS.includes("🍗"));
});

test("customers can order overnight for the next morning pickup window", () => {
  const store = {
    status: "open",
    service_periods: ["breakfast", "lunch", "afternoon_tea"],
  };
  const morning = taipei(8, 0);
  const nextBreakfast = taipei(8, 35, 28);
  assert.equal(isPickupTimeAllowed(store, nextBreakfast.toISOString(), morning), true);
  const lateNight = taipei(22, 0);
  assert.equal(isPickupTimeAllowed(store, nextBreakfast.toISOString(), lateNight), true);
  const nightSlots = pickupSlotsForStore(store, lateNight);
  assert.ok(nightSlots.some((slot) => slot.label === "08:35–08:45" && new Date(slot.value).getUTCDate() === 28));
});

test("checkout lists each school pickup window once", () => {
  const store = {
    status: "open",
    service_periods: ["breakfast", "lunch"],
  };
  assert.equal(isPickupTimeAllowed(store, taipei(8, 40).toISOString(), taipei(8, 0)), true);
  assert.equal(isPickupTimeAllowed(store, taipei(8, 50).toISOString(), taipei(8, 0)), false);
  assert.equal(isPickupTimeAllowed(store, taipei(12, 15).toISOString(), taipei(8, 0)), true);
  assert.equal(isPickupTimeAllowed(store, taipei(17, 20).toISOString(), taipei(16, 0)), true);
  assert.equal(isPickupTimeAllowed({ ...store, status: "closed" }, taipei(17, 20), taipei(16, 0)), false);
  const slots = pickupSlotsForStore(store, taipei(8, 0));
  assert.deepEqual(
    slots.map((slot) => slot.label),
    [
      "08:35–08:45",
      "09:30–09:40",
      "10:25–10:35",
      "11:20–11:30",
      "12:15–13:00",
      "17:15–17:30",
      "18:15–18:25",
    ]
  );
  const eveningSlots = pickupSlotsForStore(store, taipei(22, 0));
  assert.deepEqual(
    eveningSlots.map((slot) => slot.label),
    [
      "08:35–08:45",
      "09:30–09:40",
      "10:25–10:35",
      "11:20–11:30",
      "12:15–13:00",
      "17:15–17:30",
      "18:15–18:25",
    ]
  );
  assert.equal(new Date(eveningSlots[0].value).getUTCDate(), 28);
});

test("short evening window stays bookable until 15 minutes before it ends", () => {
  const store = {
    status: "open",
    service_periods: ["breakfast", "lunch"],
  };
  const now = taipei(18, 5);
  const slots = pickupSlotsForStore(store, now);
  const evening = slots.find((slot) => slot.label === "18:15–18:25");
  assert.ok(evening);
  assert.equal(evening.value, taipei(18, 20).toISOString());
  assert.equal(isPickupTimeAllowed(store, evening.value, now), true);
  assert.equal(isPickupTimeAllowed(store, taipei(18, 20).toISOString(), taipei(18, 12)), false);
  const tomorrowEvening = pickupSlotsForStore(store, taipei(18, 12)).find(
    (slot) => slot.label === "18:15–18:25"
  );
  assert.ok(tomorrowEvening);
  assert.equal(new Date(tomorrowEvening.value).getUTCDate(), 28);
});

test("legacy operating windows correctly cross midnight", () => {
  const overnight = {
    status: "open",
    service_periods: [],
    open_time: "22:00",
    close_time: "02:00",
  };
  assert.equal(
    isPickupTimeAllowed(overnight, localDate(23, 0).toISOString(), localDate(21, 0)),
    true
  );
  const afterMidnight = new Date(2026, 7, 28, 1, 0);
  const beforeMidnight = new Date(2026, 7, 27, 23, 30);
  assert.equal(isPickupTimeAllowed(overnight, afterMidnight.toISOString(), beforeMidnight), true);
  assert.equal(
    isPickupTimeAllowed(overnight, new Date(2026, 7, 28, 3, 0).toISOString(), beforeMidnight),
    false
  );
});

test("image signatures only accept JPEG, PNG and WebP", () => {
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(
    detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png"
  );
  assert.equal(
    detectImageMime(Uint8Array.from([...Buffer.from("RIFF0000WEBP")])),
    "image/webp"
  );
  assert.equal(detectImageMime(Uint8Array.from(Buffer.from("<svg>"))), "");
  assert.equal(IMAGE_LIMITS.sourceBytes, 8 * 1024 * 1024);
  assert.equal(IMAGE_LIMITS.outputBytes, 1024 * 1024);
});

test("Storage paths use store/product/UUID.webp", () => {
  const storeId = "123e4567-e89b-42d3-a456-426614174000";
  const productId = "123e4567-e89b-42d3-a456-426614174001";
  const fileId = "123e4567-e89b-42d3-a456-426614174002";
  const path = buildProductImagePath(storeId, productId, fileId);
  assert.equal(path, `${storeId}/${productId}/${fileId}.webp`);
  assert.equal(isValidProductImagePath(path, storeId), true);
  assert.equal(isValidProductImagePath(path, "123e4567-e89b-42d3-a456-426614174999"), false);
  assert.equal(isValidProductImagePath("data:image/png;base64,abc"), false);
});

test("order status can only advance through the full workflow", () => {
  assert.equal(canTransition("pending", "accepted"), true);
  assert.equal(canTransition("pending", "rejected"), true);
  assert.equal(canTransition("pending", "ready"), false);
  assert.equal(canTransition("accepted", "preparing"), true);
  assert.equal(canTransition("accepted", "ready"), false);
  assert.equal(canTransition("preparing", "ready"), true);
  assert.equal(canTransition("ready", "completed"), true);
  assert.equal(canTransition("completed", "pending"), false);
  assert.equal(canCustomerCancel("pending"), true);
  assert.equal(canCustomerCancel("accepted"), false);
});

test("cart enforces one store and quantity 1 to 99", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const { cart } = await import(`../js/cart.js?test=${Date.now()}`);
  const product = {
    product_id: "p1",
    store_id: "s1",
    product_name: "Meal",
    price: 50,
    status: "active",
  };
  assert.equal(cart.add(product, 99).ok, true);
  assert.equal(cart.add(product, 1).ok, false);
  assert.equal(cart.count(), 99);
  assert.equal(cart.add({ ...product, product_id: "p2", store_id: "s2" }, 1).code, "OTHER_STORE");
  assert.equal(cart.add({ ...product, product_id: "p3", status: "soldout" }, 1).ok, false);
  cart.setQty("p1", 200);
  assert.equal(cart.count(), 99);
});
