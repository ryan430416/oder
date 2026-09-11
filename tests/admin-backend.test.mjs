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

test("users failure vs empty are distinct page outcomes", async () => {
  const source = await readFile(new URL("../js/pages/admin-users.js", import.meta.url), "utf8");
  assert.match(source, /users_load_failed/);
  assert.match(source, /no_users/);
  assert.match(source, /!result\?\.ok/);
  assert.match(source, /!users\.length/);
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
  assert.match(source, /store_has_orders/);
  assert.match(source, /admin_audit_logs/);
  assert.match(source, /disable-store/);
  assert.match(source, /enable-store/);
  assert.doesNotMatch(source, /for \(const order of orders\) await deleteRecord\("orders"/);
});

test("collection rules keep audit logs admin-only and stores undeletable by clients", async () => {
  const { COLLECTION_RULES } = await import("../pocketbase/collection-rules.js");
  assert.equal(COLLECTION_RULES.stores.deleteRule, null);
  assert.equal(COLLECTION_RULES.admin_audit_logs.createRule, null);
  assert.match(COLLECTION_RULES.admin_audit_logs.listRule, /admin/);
  assert.match(COLLECTION_RULES.oder_users.listRule, /admin/);
});
