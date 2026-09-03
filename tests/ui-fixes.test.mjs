import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { productImageHtml, productImageSrc, DEFAULT_PRODUCT_IMAGE } from "../js/html.js";
import { applyProductImageFallback } from "../js/image-ui.js";
import { pickupSlotsForStore } from "../js/format.js";
import { schoolPickupWindowsLabel } from "../js/service-periods.js";
import { cartCheckoutEnabled, cartTotalDisplay, createInflight, storeListPhase } from "../js/ui-state.js";
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

test("store catalog distinguishes loading, empty, and query failure", () => {
  assert.equal(storeListPhase({ loading: true, error: false, stores: [] }), "loading");
  assert.equal(storeListPhase({ loading: false, error: false, stores: [] }), "empty");
  assert.equal(storeListPhase({ loading: false, error: true, stores: [] }), "error");
  assert.equal(
    storeListPhase({
      loading: true,
      error: true,
      stores: [{ store_id: "s1", store_name: "A" }],
    }),
    "list"
  );
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
    new Date("2026-08-27T08:00:00+08:00")
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
  }
});
