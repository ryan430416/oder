import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pocketBaseImageErrorCode } from "../js/product-image.js";
import {
  imageWritePlan,
  nextStoreOrderingStatus,
  orderAllowedForStoreStatus,
  passwordChangeTarget,
  storeOrderingTarget,
  validatePasswordChange,
} from "../js/store-self-service.js";

test("new orders are accepted only while a store is open", () => {
  assert.equal(orderAllowedForStoreStatus("open"), true);
  assert.equal(orderAllowedForStoreStatus("closed"), false);
  assert.equal(orderAllowedForStoreStatus("disabled"), false);
});

test("a store can pause and resume only its own store, and cannot undo an admin disable", () => {
  assert.deepEqual(storeOrderingTarget("store-a", ""), { ok: true, storeId: "store-a" });
  assert.deepEqual(storeOrderingTarget("store-a", "store-a"), { ok: true, storeId: "store-a" });
  assert.equal(storeOrderingTarget("store-a", "store-b").code, "not_store");
  assert.equal(storeOrderingTarget("", "store-a").code, "not_store");
  assert.deepEqual(nextStoreOrderingStatus("open", "closed"), { ok: true, status: "closed" });
  assert.deepEqual(nextStoreOrderingStatus("closed", "open"), { ok: true, status: "open" });
  assert.equal(nextStoreOrderingStatus("disabled", "open").code, "store_disabled_by_admin");
  assert.equal(nextStoreOrderingStatus("open", "disabled").code, "invalid_status");
});

test("password changes stay on the signed-in account and reject a mismatched confirmation", () => {
  assert.deepEqual(passwordChangeTarget("user-a", ""), { ok: true, userId: "user-a" });
  assert.equal(passwordChangeTarget("user-a", "user-b").code, "not_store");
  assert.equal(validatePasswordChange({ currentPassword: "old1", newPassword: "new1", confirmPassword: "new2" }), "password_mismatch");
  assert.equal(validatePasswordChange({ currentPassword: "old1", newPassword: "n1", confirmPassword: "n1" }), "password_too_short_new");
  assert.equal(validatePasswordChange({ currentPassword: "old1", newPassword: "old1", confirmPassword: "old1" }), "password_unchanged");
  assert.equal(validatePasswordChange({ currentPassword: "old1", newPassword: "new1", confirmPassword: "new1" }), "");
});

test("image checks run before a product record is created, and removing an image clears it", () => {
  assert.equal(imageWritePlan({ isUpdate: false, fileReady: true }).prepareBeforeCreate, true);
  assert.equal(imageWritePlan({ isUpdate: false, fileReady: true }).replaceOnCreate, true);
  assert.equal(imageWritePlan({ isUpdate: true, fileReady: true }).replaceOnUpdate, true);
  assert.equal(imageWritePlan({ isUpdate: true, imageRemoved: true }).clearImage, true);
  assert.equal(pocketBaseImageErrorCode("validation_file_size", 400), "invalid_image_size");
  assert.equal(pocketBaseImageErrorCode("validation_invalid_mime_type", 400), "invalid_image_type");
  assert.equal(pocketBaseImageErrorCode("", 403), "storage_forbidden");
  assert.equal(pocketBaseImageErrorCode("", 0), "image_network_failed");
});

test("fresh migrations reference oder_users instead of the built-in users collection", async () => {
  const source = await readFile(new URL("../pocketbase/pb_migrations/1700000001_init_collections.js", import.meta.url), "utf8");
  const setup = await readFile(new URL("../scripts/setup-school-collections.mjs", import.meta.url), "utf8");
  assert.match(source, /findCollectionByNameOrId\("oder_users"\)/);
  assert.match(source, /collectionId: oderUsers\.id/);
  assert.doesNotMatch(source, /collectionId: users\.id/);
  assert.match(setup, /byName\(\)\.oder_users\.id/);
  const guard = await readFile(
    new URL("../pocketbase/pb_migrations/1700000008_order_customer_relation.js", import.meta.url),
    "utf8"
  );
  assert.match(guard, /must reference oder_users/);
  assert.doesNotMatch(guard, /removeByName|collectionId = users\.id/);
});

test("both backends refuse paused stores, foreign stores, and foreign password targets", async () => {
  const handler = await readFile(new URL("../server/app-handlers.js", import.meta.url), "utf8");
  const hook = await readFile(new URL("../pocketbase/pb_hooks/main.pb.js", import.meta.url), "utf8");
  assert.match(handler, /set-store-ordering/);
  assert.match(handler, /change-own-password/);
  assert.match(handler, /nextStoreOrderingStatus/);
  assert.match(handler, /orderAllowedForStoreStatus/);
  assert.match(hook, /set-store-ordering/);
  assert.match(hook, /change-own-password/);
  assert.match(hook, /store_disabled_by_admin/);
  assert.match(hook, /bad_password/);
  assert.match(hook, /store\.get\("status"\) !== "open"/);
  const handlerPassword = handler.slice(handler.indexOf("async function changeOwnPassword"));
  assert.match(handlerPassword, /passwordChangeTarget\(auth\.record\.id/);
  assert.doesNotMatch(handlerPassword, /updateRecord\(AUTH, body\.user_id/);
  assert.match(hook, /if \(requested && requested !== e\.auth\.id\) return fail\(e, "not_store"\)/);
});
