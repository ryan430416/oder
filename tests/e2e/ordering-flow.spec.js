import { expect, test } from "@playwright/test";

const enabled = Boolean(process.env.E2E_BASE_URL);
test.skip(!enabled, "Set E2E_BASE_URL and test Supabase environment variables.");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mNk+M9QzwAEYBxVSFUAAN0ABf5uG14AAAAASUVORK5CYII=",
  "base64"
);

test("admin creates store, store uploads product, customer orders, realtime status updates", async ({
  browser,
  page,
}) => {
  const suffix = `${Date.now()}-${test.info().project.name}`.replace(/[^a-z0-9-]/gi, "");
  const storeName = `E2E 校園餐廳 ${suffix}`;
  const storeLogin = `e2e-${suffix}`;
  const storePassword = "Test1234!";
  const productName = `健康餐盒 ${suffix}`;

  await page.goto("/admin/index.html");
  await page.getByLabel("帳號").fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.getByLabel("密碼").fill(process.env.E2E_ADMIN_PASSWORD || "1234");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/admin\/dashboard\.html/);
  await page.goto("/admin/stores.html");
  await page.getByLabel("店家名稱").fill(storeName);
  await page.getByLabel("說明").fill("Playwright 自動測試店家");
  await page.getByLabel("店家帳號").fill(storeLogin);
  await page.getByLabel("店家密碼").fill(storePassword);
  await page.getByRole("button", { name: /新增店家/ }).click();
  await expect(page.locator("#msg")).toContainText(storeName);

  const storeContext = await browser.newContext({
    viewport: test.info().project.name === "mobile-360" ? { width: 360, height: 800 } : undefined,
  });
  const storePage = await storeContext.newPage();
  await storePage.goto(`${process.env.E2E_BASE_URL}/store/index.html`);
  await storePage.getByLabel("帳號").fill(storeLogin);
  await storePage.getByLabel("密碼").fill(storePassword);
  await storePage.getByRole("button", { name: "登入" }).click();
  await storePage.goto(`${process.env.E2E_BASE_URL}/store/menu.html`);
  await storePage.getByLabel("餐點名稱").fill(productName);
  await storePage.getByLabel("分類").fill("主餐");
  await storePage.getByLabel("說明").fill("自動測試商品");
  await storePage.getByLabel("價格").fill("80");
  await storePage.getByLabel(/餐點照片/).setInputFiles({
    name: "meal.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(storePage.locator("#photoPreview img")).toBeVisible();
  await storePage.getByRole("button", { name: /新增餐點/ }).click();
  await expect(storePage.locator("#list")).toContainText(productName);

  const customerContext = await browser.newContext({
    viewport: test.info().project.name === "mobile-360" ? { width: 360, height: 800 } : undefined,
  });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(`${process.env.E2E_BASE_URL}/customer/index.html`);
  await customerPage.locator("#custName").fill("測試學生");
  await customerPage.locator("#custGrade").selectOption("high_1");
  await customerPage.locator("#saveName").click();
  await customerPage.getByText(storeName).click();
  await expect(customerPage.getByText(productName)).toBeVisible();
  await expect(customerPage.locator("img.product-photo")).toBeVisible();
  await customerPage.getByRole("button", { name: "加入" }).click();
  await customerPage.goto(`${process.env.E2E_BASE_URL}/customer/cart.html`);
  await customerPage.getByRole("link", { name: /結帳/ }).click();
  await expect(customerPage.locator("#pickup option")).not.toHaveCount(0);
  await customerPage.locator("#confirm").click();
  await expect(customerPage).toHaveURL(/customer\/orders\.html/);

  await storePage.goto(`${process.env.E2E_BASE_URL}/store/dashboard.html`);
  await expect(storePage.locator("#list")).toContainText("測試學生");
  await storePage.getByRole("button", { name: "接單" }).first().click();
  await expect(customerPage.locator("#list")).toContainText("店家已接單");

  await storeContext.close();
  await customerContext.close();
});
