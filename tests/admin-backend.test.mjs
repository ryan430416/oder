import test from "node:test";
import assert from "node:assert/strict";
import {
  bangkokDayRange,
  canPermanentlyDeleteStore,
  dashboardOnboardingTip,
  photoFormVisibility,
  pocketBaseCreatedRangeFilter,
  sanitizeAdminUser,
  sumTrustedRevenue,
} from "../js/admin-data.js";
import { readFile } from "node:fs/promises";

test("admin users are loaded from oder_users by role, without a missing created sort", async () => {
  const source = await readFile(new URL("../js/pocketbase-api.js", import.meta.url), "utf8");
  const usersFn = source.slice(source.indexOf("async getAdminUsers"), source.indexOf("deleteUserAccount"));
  assert.match(usersFn, /AUTH_COLLECTION/);
  assert.match(usersFn, /role/);
  assert.doesNotMatch(usersFn, /profiles/);
  assert.doesNotMatch(usersFn, /sort: "-created"/);
  assert.doesNotMatch(usersFn, /fields: "id,email,display_name,role,status,store,grade,created"/);
  const page = await readFile(new URL("../js/pages/admin-users.js", import.meta.url), "utf8");
  assert.match(page, /users_load_failed/);
  assert.match(page, /no_users/);
  assert.match(page, /!result\?\.ok/);
});

test("sanitizeAdminUser strips secrets", () => {
  const safe = sanitizeAdminUser({
    id: "u1",
    display_name: "Ada",
    email: "ada@campus-order.test",
    role: "admin",
    status: "active",
    store: "",
    password: "secret",
    tokenKey: "tok",
    created: "2026-09-11T10:15:00.000Z",
  });
  assert.equal(safe.password, undefined);
  assert.equal(safe.tokenKey, undefined);
  assert.equal(safe.email, "ada");
  assert.equal(safe.name, "Ada");
});

test("dashboard tip hides when stores and products exist", () => {
  assert.equal(dashboardOnboardingTip({ stores: 0, products: 0 }), "tip_add_stores");
  assert.equal(dashboardOnboardingTip({ stores: 2, products: 0 }), "tip_add_products");
  assert.equal(dashboardOnboardingTip({ stores: 2, products: 4 }), null);
  assert.equal(dashboardOnboardingTip({ stores: 2, products: 4, loading: true }), null);
  assert.equal(dashboardOnboardingTip({ stores: 0, products: 0, error: true }), null);
});

test("photo form hides preview remove retry until needed", () => {
  assert.deepEqual(photoFormVisibility({}), { preview: false, remove: false, retry: false });
  assert.deepEqual(photoFormVisibility({ hasPreview: true }), {
    preview: true,
    remove: true,
    retry: false,
  });
  assert.deepEqual(photoFormVisibility({ hasPreview: true, uploadFailed: true }), {
    preview: true,
    remove: true,
    retry: true,
  });
});

test("store delete rules protect order history", () => {
  assert.equal(canPermanentlyDeleteStore({ orders: 0, products: 3 }), true);
  assert.equal(canPermanentlyDeleteStore({ orders: 1, products: 0 }), false);
});

test("revenue ignores cancelled and rejected", () => {
  assert.equal(
    sumTrustedRevenue([
      { status: "completed", total: 100 },
      { status: "cancelled", total: 50 },
      { status: "rejected", total: 20 },
      { status: "pending", total: 30 },
    ]),
    130
  );
});

test("Bangkok day filter is timezone fixed", () => {
  const range = bangkokDayRange("2026-09-11");
  assert.equal(range.startIso, "2026-09-10T17:00:00.000Z");
  assert.equal(range.endIso, "2026-09-11T17:00:00.000Z");
  assert.match(pocketBaseCreatedRangeFilter("2026-09-11"), /2026-09-10T17:00:00\.000Z/);
});

test("admin orders keep cache on realtime errors and use Bangkok dates", async () => {
  const source = await readFile(new URL("../js/pages/admin-orders.js", import.meta.url), "utf8");
  assert.match(source, /keepOnError/);
  assert.match(source, /watchOrders/);
  assert.match(source, /campusDateKey/);
  assert.match(source, /ORD|order_number/);
});

test("delete-store refuses stores with orders in server handler", async () => {
  const source = await readFile(new URL("../server/app-handlers.js", import.meta.url), "utf8");
  const deleteFn = source.slice(source.indexOf("async function deleteStore"), source.indexOf("async function disableStore"));
  assert.match(source, /store_has_orders/);
  assert.match(source, /admin_audit_logs/);
  assert.match(source, /disable-store/);
  assert.match(source, /enable-store/);
  assert.match(deleteFn, /if \(!isAdmin\(auth\.record\)\) return fail\("not_admin"\)/);
  assert.match(deleteFn, /canPermanentlyDeleteStore/);
  assert.match(deleteFn, /store_has_orders/);
  assert.doesNotMatch(deleteFn, /deleteRecord\("orders"/);
  assert.doesNotMatch(deleteFn, /deleteRecord\("order_items"/);
});

test("PocketBase hook delete-store mirrors no-order-only delete and not_admin", async () => {
  const source = await readFile(new URL("../pocketbase/pb_hooks/main.pb.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/app\/delete-store/);
  assert.match(source, /if \(!isAdmin\(e\.auth\)\) return fail\(e, "not_admin"\)/);
  assert.match(source, /store_has_orders/);
  assert.match(source, /\/api\/app\/disable-store/);
  assert.doesNotMatch(source, /delete\(order/);
});

test("admin stores disable delete when a store has historical orders", async () => {
  const source = await readFile(new URL("../js/pages/admin-stores.js", import.meta.url), "utf8");
  assert.match(source, /getStoreOrderCounts/);
  assert.match(source, /store_delete_locked/);
  assert.match(source, /disabled aria-disabled="true"/);
  assert.match(source, /data-orders="0"/);
  assert.doesNotMatch(source, /confirm_disable_store_history/);
  assert.match(source, /canPermanentlyDeleteStore\(impact\)/);
  assert.match(source, /confirm_delete_store_safe/);
});

test("admin and store pages end cleanly on session expiry without throwing", async () => {
  const adminBoot = await readFile(new URL("../js/admin-boot.js", import.meta.url), "utf8");
  const storeBoot = await readFile(new URL("../js/store-boot.js", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../js/pages/admin-dashboard.js", import.meta.url), "utf8");
  assert.match(adminBoot, /runAdminPage/);
  assert.match(adminBoot, /if \(!session\) return null/);
  assert.match(storeBoot, /runStorePage/);
  assert.match(dashboard, /runAdminPage/);
  assert.doesNotMatch(dashboard, /throw new Error\("admin"\)/);
  for (const file of [
    "admin-users.js",
    "admin-orders.js",
    "admin-analytics.js",
    "admin-products.js",
    "admin-stores.js",
    "store-dashboard.js",
    "store-menu.js",
    "store-notifications.js",
  ]) {
    const source = await readFile(new URL(`../js/pages/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /throw new Error\("(admin|store)"\)/);
  }
});

test("collection rules keep audit logs admin-only and stores undeletable by clients", async () => {
  const { COLLECTION_RULES } = await import("../pocketbase/collection-rules.js");
  assert.equal(COLLECTION_RULES.stores.deleteRule, null);
  assert.equal(COLLECTION_RULES.admin_audit_logs.createRule, null);
  assert.match(COLLECTION_RULES.admin_audit_logs.listRule, /admin/);
  assert.match(COLLECTION_RULES.oder_users.listRule, /admin/);
});
