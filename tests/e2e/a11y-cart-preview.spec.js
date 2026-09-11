import { expect, test } from "@playwright/test";

async function noPageOverflow(page) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
}

async function maybeAcceptDialog(page, timeoutMs = 1500) {
  try {
    const dialog = await page.waitForEvent("dialog", { timeout: timeoutMs });
    await dialog.accept();
  } catch {
    /* no dialog */
  }
}

async function answerNextDialog(page, accept) {
  const dialog = await page.waitForEvent("dialog");
  if (accept) await dialog.accept();
  else await dialog.dismiss();
}

test("store categories, image preview a11y, and cart remove confirm", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile-360";

  await page.goto("/customer/index.html");
  await expect(page.locator("#list .store-card, #list .empty, #catalogStatus .btn").first()).toBeVisible({
    timeout: 20_000,
  });
  if ((await page.locator(".store-card").count()) === 0) {
    test.skip(true, "No stores available in this environment");
  }

  await page.locator(".store-card").first().click();
  await expect(page.locator("#cats button[data-cat]").first()).toBeVisible({ timeout: 20_000 });
  if (isMobile) await noPageOverflow(page);

  const allBtn = page.locator('#cats button[data-cat="__all__"]');
  await expect(allBtn).toHaveAttribute("aria-pressed", "true");
  const other = page.locator("#cats button[data-cat]:not([data-cat='__all__'])").first();
  if ((await other.count()) > 0) {
    await expect(other).toHaveAttribute("aria-pressed", "false");
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    await expect(allBtn).toHaveAttribute("aria-pressed", "false");
    await allBtn.click();
    await expect(allBtn).toHaveAttribute("aria-pressed", "true");
  }

  const previewBtn = page.locator("button.product-image-button[data-image-preview]").first();
  if ((await previewBtn.count()) > 0) {
    await previewBtn.focus();
    await previewBtn.click();
    const dialog = page.locator("dialog.image-lightbox[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-label", /.+/);
    await expect(dialog.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.image-lightbox[open]")).toHaveCount(0);
    await expect(previewBtn).toBeFocused();
    const closedSafe = await page.evaluate(() => {
      const el = document.querySelector("dialog.image-lightbox");
      if (!el || el.open) return false;
      return el.inert === true || el.getAttribute("aria-hidden") === "true";
    });
    expect(closedSafe).toBe(true);
  }

  const addBtn = page.locator("button[data-add]:not([disabled])").first();
  if ((await addBtn.count()) > 0) {
    await page.evaluate(() => localStorage.removeItem("campus_order_cart"));
    const otherStoreDialog = maybeAcceptDialog(page, 2000);
    await addBtn.click();
    await otherStoreDialog;

    await page.goto("/customer/cart.html");
    const qty = page.locator("input[data-qty]").first();
    await expect(qty).toBeVisible({ timeout: 20_000 });
    await qty.fill("1");
    await qty.blur();
    await expect(qty).toHaveValue("1");

    const cancelDialog = answerNextDialog(page, false);
    await page.locator('button[data-d="-1"]').first().click();
    await cancelDialog;
    await expect(page.locator("input[data-qty]").first()).toHaveValue("1");

    const removeDialog = answerNextDialog(page, true);
    await page.locator('button[data-d="-1"]').first().click();
    await removeDialog;
    await expect(page.locator("#lines .empty")).toBeVisible();
    await expect(page.locator("input[data-qty]")).toHaveCount(0);
  }

  if (isMobile) await noPageOverflow(page);
});

test("360px store page supports keyboard focus and touch on categories", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-360", "mobile-360 only");
  await page.goto("/customer/index.html");
  await expect(page.locator("#list .store-card, #list .empty, #catalogStatus .btn").first()).toBeVisible({
    timeout: 20_000,
  });
  if ((await page.locator(".store-card").count()) === 0) {
    test.skip(true, "No stores available in this environment");
  }
  await page.locator(".store-card").first().click();
  await expect(page.locator("#cats button[data-cat]").first()).toBeVisible({ timeout: 20_000 });
  await noPageOverflow(page);

  const firstCat = page.locator("#cats button[data-cat]").first();
  await firstCat.focus();
  await expect(firstCat).toBeFocused();
  await page.keyboard.press("Tab");
  await firstCat.tap();
  await expect(firstCat).toHaveAttribute("aria-pressed", "true");
  await noPageOverflow(page);
});
