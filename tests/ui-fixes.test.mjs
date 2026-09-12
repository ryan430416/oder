import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { productImageHtml, productImageSrc, DEFAULT_PRODUCT_IMAGE } from "../js/html.js";
import { applyProductImageFallback } from "../js/image-ui.js";
import { pickupSlotsForStore } from "../js/format.js";
import { schoolPickupWindowsLabel } from "../js/service-periods.js";
import {
  cartCheckoutEnabled,
  cartTotalDisplay,
  createInflight,
  fetchListPhase,
  menuListPhase,
  storeListPhase,
} from "../js/ui-state.js";
import { setLang, t } from "../js/i18n.js";

const DATE_OR_DAY_RE = /今天|明天|today|tomorrow|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\/\d{1,2}/i;

test("empty product image_url and image_path render the default meal image", () => {
  assert.equal(existsSync(resolve("images/default-meal.svg")), true);
  assert.match(DEFAULT_PRODUCT_IMAGE, /default-meal\.svg/);
  for (const value of ["", null, undefined]) {
    const html = productImageHtml(value, "雞腿便當");
    assert.match(html, /default-meal\.svg/);
    assert.match(html, /alt="雞腿便當"/);
    assert.doesNotMatch(html, /src=""/);
    assert.doesNotMatch(html, /src="null"/);
    assert.doesNotMatch(html, /src="undefined"/);
    assert.doesNotMatch(html, /No image/);
    assert.equal(productImageSrc(value), DEFAULT_PRODUCT_IMAGE);
  }
});

test("broken product images switch to the default meal image", () => {
  const image = {
    src: "https://example.com/missing.jpg",
    dataset: { defaultSrc: DEFAULT_PRODUCT_IMAGE },
    removeAttribute() {},
    setAttribute(name, value) {
      if (name === "src") this.src = value;
    },
    closest() {
      return null;
    },
  };
  applyProductImageFallback(image);
  assert.equal(image.src, DEFAULT_PRODUCT_IMAGE);
  assert.equal(image.dataset.fallbackApplied, "1");
  applyProductImageFallback(image);
  assert.equal(image.src, DEFAULT_PRODUCT_IMAGE);
});

test("store catalog distinguishes loading, empty, query failure, and auth failure", () => {
  assert.equal(storeListPhase({ loading: true, error: false, stores: [] }), "loading");
  assert.equal(storeListPhase({ loading: false, error: false, stores: [] }), "empty");
  assert.equal(storeListPhase({ loading: false, error: true, stores: [] }), "error");
  assert.equal(storeListPhase({ loading: false, authError: true, stores: [] }), "auth_error");
  assert.equal(
    storeListPhase({
      loading: true,
      error: true,
      stores: [{ store_id: "s1", store_name: "A" }],
    }),
    "list"
  );
});

test("customer orders and notices stay in loading until the query finishes", async () => {
  assert.equal(fetchListPhase({ loading: true, loaded: false, count: 0 }), "loading");
  assert.equal(fetchListPhase({ loading: false, error: true, loaded: false }), "error");
  assert.equal(fetchListPhase({ loaded: true, count: 0 }), "empty");
  assert.equal(fetchListPhase({ loaded: true, count: 2 }), "list");
  assert.notEqual(fetchListPhase({ loading: true, loaded: false, count: 0 }), "empty");

  const ordersHtml = await readFile(new URL("../customer/orders.html", import.meta.url), "utf8");
  const ordersJs = await readFile(new URL("../js/pages/customer-orders.js", import.meta.url), "utf8");
  const notesHtml = await readFile(new URL("../customer/notifications.html", import.meta.url), "utf8");
  const notesJs = await readFile(new URL("../js/pages/notices.js", import.meta.url), "utf8");
  assert.match(ordersHtml, /orders_loading/);
  assert.match(ordersHtml, /class="card skeleton"/);
  assert.match(ordersJs, /orders_load_failed/);
  assert.match(ordersJs, /filterTabButton/);
  assert.match(ordersJs, /hasLoaded/);
  assert.match(ordersJs, /keepOnError/);
  const filters = await readFile(new URL("../js/order-filters.js", import.meta.url), "utf8");
  assert.match(filters, /aria-pressed/);
  assert.match(notesHtml, /notices_loading/);
  assert.match(notesJs, /notices_load_failed/);
  assert.match(notesJs, /onRetry|data-retry-notices/);
  assert.match(notesJs, /notice_empty/);
  const emptyBeforeLoad = notesJs.indexOf("notices_loading") < notesJs.indexOf("notice_empty");
  assert.equal(emptyBeforeLoad, true);
});

test("order items are loaded in one batched query, not once per order", async () => {
  const source = await readFile(new URL("../js/pocketbase-api.js", import.meta.url), "utf8");
  const query = source.slice(source.indexOf("async function orderQuery"), source.indexOf("export const pocketbaseApi"));
  assert.match(query, /Promise\.all/);
  assert.match(source, /order\.customer/);
  assert.match(source, /order\.store/);
  assert.doesNotMatch(query, /for \(const order of orders\)/);
  const schema = await readFile(
    new URL("../pocketbase/pb_migrations/1700000001_init_collections.js", import.meta.url),
    "utf8"
  );
  assert.match(schema, /idx_order_items_order/);
  assert.match(schema, /idx_orders_customer_created/);
  assert.match(schema, /idx_notifications_user_created/);
});

test("menu list distinguishes loading, empty, and PocketBase failure", () => {
  assert.equal(menuListPhase({ loading: true, products: [] }), "loading");
  assert.equal(menuListPhase({ loading: false, products: [] }), "empty");
  assert.equal(menuListPhase({ loading: false, error: true, products: [] }), "error");
  assert.equal(
    menuListPhase({ loading: false, error: false, products: [{ product_id: "p1" }] }),
    "list"
  );
});

test("customer store page shows skeleton loading and retryable failure", async () => {
  const html = await readFile(new URL("../customer/store.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../js/pages/customer-store.js", import.meta.url), "utf8");
  assert.match(html, /products_loading/);
  assert.match(html, /class="card skeleton"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(source, /products_loading/);
  assert.match(source, /products_load_failed/);
  assert.match(source, /onRetry/);
  assert.match(source, /showMenuLoading/);
});

test("cart keeps loading UI until PocketBase prices resolve", async () => {
  const html = await readFile(new URL("../customer/cart.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../js/pages/customer-cart.js", import.meta.url), "utf8");
  assert.match(html, /cart_updating/);
  assert.match(html, /class="card skeleton"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(source, /showLoading\(\)/);
  assert.match(source, /cartTotalDisplay\(\{ loading: true/);
  assert.match(source, /setCheckoutEnabled\(false\)/);
});

test("retry helper ignores duplicate in-flight requests", async () => {
  const gate = createInflight();
  let runs = 0;
  const first = gate.run(async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  });
  const second = await gate.run(async () => {
    runs += 1;
    return "again";
  });
  assert.equal(second.skipped, true);
  assert.equal((await first).value, "ok");
  assert.equal(runs, 1);
});

test("cart loading does not display a false NT$0 total", () => {
  const money = (n) => `NT$ ${n}`;
  assert.equal(cartTotalDisplay({ loading: true, total: 80, money }), "");
  assert.doesNotMatch(cartTotalDisplay({ loading: true, total: 80, money }), /NT\$\s*0/);
  assert.equal(cartTotalDisplay({ loading: false, total: 80, money }), "NT$ 80");
  assert.equal(cartTotalDisplay({ loading: false, empty: true, money }), "NT$ 0");
  assert.equal(
    cartCheckoutEnabled({ loading: true, error: false, empty: false, storeOpen: true }),
    false
  );
  assert.equal(
    cartCheckoutEnabled({ loading: false, error: true, empty: false, storeOpen: true }),
    false
  );
  assert.equal(
    cartCheckoutEnabled({ loading: false, error: false, empty: false, storeOpen: true }),
    true
  );
});

test("school pickup windows display time ranges only", () => {
  const labels = pickupSlotsForStore(
    { status: "open", service_periods: ["breakfast", "lunch", "afternoon_tea"] },
    new Date("2026-08-27T08:00:00+07:00")
  ).map((slot) => slot.label);
  assert.deepEqual(labels, [
    "08:35–08:45",
    "09:30–09:40",
    "10:25–10:35",
    "11:20–11:30",
    "12:15–13:00",
    "17:15–17:30",
    "18:15–18:25",
  ]);
  for (const label of labels) {
    assert.doesNotMatch(label, DATE_OR_DAY_RE);
  }
  assert.doesNotMatch(schoolPickupWindowsLabel(), DATE_OR_DAY_RE);
});

test("admin store form no longer includes meal-period checkboxes", async () => {
  const html = await readFile(new URL("../admin/stores.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /name="service_periods"/);
  assert.doesNotMatch(html, /period_breakfast/);
  assert.doesNotMatch(html, /period_lunch/);
  assert.doesNotMatch(html, /period_afternoon_tea/);
  assert.match(html, /id="schoolPickupNote"/);
});

test("portal copy is translated in zh, en, th, and my", () => {
  const values = new Map([["campus_order_lang", JSON.stringify("zh")]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const expected = {
    zh: "目前為系統測試版本，資料將同步至測試資料庫。",
    en: "This is a system test version. Data will sync to the test database.",
    th: "ขณะนี้เป็นเวอร์ชันทดสอบของระบบ ข้อมูลจะซิงค์ไปยังฐานข้อมูลทดสอบ",
    my: "ယခု စနစ်စမ်းသပ်ဗားရှင်းဖြစ်ပြီး ဒေတာကို စမ်းသပ်ဒေတာဘေ့စ်သို့ စင့်ခ်လုပ်ပါမည်။",
  };
  for (const [lang, text] of Object.entries(expected)) {
    setLang(lang);
    assert.equal(t("portal_sub"), text);
    assert.doesNotMatch(t("portal_sub"), /單機|只保存在這台裝置|device-only|อุปกรณ์นี้|ဤစက်တွင်သာ/);
    assert.equal(t("cart_store", { name: "Central Cafe", id: "should-not-appear" }), t("cart_store", { name: "Central Cafe" }));
    assert.doesNotMatch(t("cart_store", { name: "Central Cafe", id: "uuid-here" }), /uuid-here/);
    assert.equal(t("cart_hint_empty").includes("請先選擇店家商品") || t("cart_hint_empty").length > 0, true);
    assert.equal(t("products_loading").length > 0, true);
    assert.equal(t("products_load_failed").length > 0, true);
    assert.equal(t("orders_loading").length > 0, true);
    assert.equal(t("notices_loading").length > 0, true);
    assert.equal(t("notices_load_failed").length > 0, true);
  }
});
