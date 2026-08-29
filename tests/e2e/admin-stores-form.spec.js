import { expect, test } from "@playwright/test";

test("admin store form has no meal-period checkboxes after login", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/admin/index.html");
  await page.locator("#form[data-ready='1']").waitFor();
  await page.locator("#adminUsername").fill(process.env.E2E_ADMIN_USERNAME || "admin");
  await page.locator("#adminPassword").fill(process.env.E2E_ADMIN_PASSWORD || "1234");
  await page.getByRole("button", { name: "登入" }).click();
  try {
    await expect(page).toHaveURL(/admin\/dashboard\.html/, { timeout: 20_000 });
  } catch (error) {
    const message = await page.locator("#err").textContent();
    test.info().annotations.push({ type: "login", description: message || page.url() });
    throw new Error(`Admin login failed: ${message || page.url()}`);
  }
  await page.goto("/admin/stores.html");
  await expect(page.locator("#form")).toBeVisible();
  await expect(page.locator('input[name="service_periods"]')).toHaveCount(0);
  await expect(page.locator("#schoolPickupNote")).toContainText("08:35–08:45");
  await expect(page.locator("#schoolPickupNote")).not.toContainText(/今天|明天/);
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
});
