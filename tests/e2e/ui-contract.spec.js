import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const DATE_OR_DAY_RE = /今天|明天|today|tomorrow/i;

async function noPageOverflow(page) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
}

test("portal copy, retry after backend failure, and 360px layout", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => {
    if (/Failed to fetch|NetworkError|backend_unavailable/.test(error.message)) return;
    errors.push(error.message);
  });

  await page.route("**/rest/v1/stores*", (route) => route.abort());
  await page.goto("/index.html");
  await expect(page.locator("[data-i18n='portal_sub']")).toHaveText(/系統測試版本|test database|ฐานข้อมูลทดสอบ|စမ်းသပ်ဒေတာဘေ့စ်/);
  await expect(page.getByRole("button", { name: /重試|Retry|ลองอีกครั้ง|ထပ်စမ်း/ })).toBeVisible();
  await page.unroute("**/rest/v1/stores*");
  await page.getByRole("button", { name: /重試|Retry|ลองอีกครั้ง|ထပ်စမ်း/ }).click();
  await expect(page.locator("#backendStatus")).toBeHidden({ timeout: 20_000 });

  for (const [lang, text] of [
    ["zh", "目前為系統測試版本，資料將同步至測試資料庫。"],
    ["en", "This is a system test version. Data will sync to the test database."],
    ["th", "ขณะนี้เป็นเวอร์ชันทดสอบของระบบ ข้อมูลจะซิงค์ไปยังฐานข้อมูลทดสอบ"],
    ["my", "ယခု စနစ်စမ်းသပ်ဗားရှင်းဖြစ်ပြီး ဒေတာကို စမ်းသပ်ဒေတာဘေ့စ်သို့ စင့်ခ်လုပ်ပါမည်။"],
  ]) {
    await page.evaluate((id) => localStorage.setItem("campus_order_lang", JSON.stringify(id)), lang);
    await page.reload();
    await expect(page.locator("[data-i18n='portal_sub']")).toHaveText(text);
  }

  if (testInfo.project.name === "mobile-360") {
    await noPageOverflow(page);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("customer home shows loading then not a false empty state", async ({ page }, testInfo) => {
  await page.route("**/rest/v1/stores?select=*", async (route) => {
    if (route.request().method() === "GET" || route.request().method() === "HEAD") {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  await page.goto("/customer/index.html");
  await expect(page.locator("#list .skeleton").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#list")).not.toContainText(/沒有符合的店家|No matching stores/, { timeout: 500 });
  await expect(page.locator("#list .empty")).toHaveCount(0);

  await expect(page.locator("#list .store-card, #list .empty, #catalogStatus .btn").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("body")).not.toContainText(DATE_OR_DAY_RE);
  if ((await page.locator(".store-card").count()) > 0) {
    await expect(page.locator("body")).toContainText("08:35–08:45");
    await page.locator(".store-card").first().click();
    const photo = page.locator("img.product-photo").first();
    if ((await photo.count()) > 0) {
      await expect(photo).toBeVisible();
      await expect(photo).not.toHaveAttribute("src", "");
      await expect(photo).toHaveAttribute("alt", /.+/);
    }
    if (testInfo.project.name === "mobile-360") await noPageOverflow(page);
  }
  if (testInfo.project.name === "mobile-360") await noPageOverflow(page);
});

test("cart loading keeps checkout disabled and does not flash NT$ 0", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "campus_order_cart",
      JSON.stringify({
        store_id: "00000000-0000-4000-8000-000000000000",
        items: [{ product_id: "p1", store_id: "00000000-0000-4000-8000-000000000000", product_name: "Meal", unit_price: 80, quantity: 1 }],
      })
    );
  });
  await page.route("**/rest/v1/stores*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/customer/cart.html");
  await expect(page.locator("#storeHint")).toContainText(/正在更新購物車|Updating cart|กำลังอัปเดตตะกร้า|အပ်ဒိတ်/);
  await expect(page.locator("#total")).not.toHaveText(/NT\$\s*0/);
  await expect(page.locator("#goCheckout")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("body")).not.toContainText("00000000-0000-4000-8000-000000000000");
  if (testInfo.project.name === "mobile-360") await noPageOverflow(page);
});

test("admin store form has no per-store meal-period checkboxes", async ({ page }, testInfo) => {
  const html = await readFile(new URL("../../admin/stores.html", import.meta.url), "utf8");
  expect(html).not.toMatch(/name="service_periods"/);
  await page.goto("/admin/stores.html");
  await expect(page.locator('input[name="service_periods"]')).toHaveCount(0);
  if (testInfo.project.name === "mobile-360") await noPageOverflow(page);
});

test("checkout pickup options stay time-only", async ({ page }, testInfo) => {
  await page.goto("/customer/checkout.html");
  const labels = await page.locator("#pickup option").allTextContents();
  for (const label of labels) {
    expect(label).not.toMatch(DATE_OR_DAY_RE);
    expect(label).not.toMatch(/\d{4}/);
  }
  if (testInfo.project.name === "mobile-360") {
    await noPageOverflow(page);
    await page.goto("/customer/store.html");
    await noPageOverflow(page);
  }
});

test("main pages do not throw console page errors", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => {
    if (/Failed to fetch|NetworkError|backend_unavailable/.test(error.message)) return;
    errors.push(`${page.url()} ${error.message}`);
  });
  for (const path of [
    "/index.html",
    "/customer/index.html",
    "/customer/cart.html",
    "/customer/checkout.html",
    "/admin/index.html",
  ]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    if (testInfo.project.name === "mobile-360") await noPageOverflow(page);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});
