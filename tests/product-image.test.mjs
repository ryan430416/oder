import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildProductImagePath,
  detectImageMime,
  IMAGE_LIMITS,
  isUuid,
  isValidProductImagePath,
  maskStoragePath,
  storageHttpErrorCode,
  uploadProductImage,
  validateProductImage,
} from "../js/product-image.js";

function fakeFile(bytes, type, size) {
  const buffer = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    size: size ?? buffer.byteLength,
    type,
    slice() {
      return {
        arrayBuffer: async () => buffer.slice().buffer,
      };
    },
  };
}

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from(Buffer.from("RIFF0000WEBP1234"));
const storeId = "123e4567-e89b-42d3-a456-426614174000";
const productId = "123e4567-e89b-42d3-a456-426614174001";

test("JPEG PNG and WebP signatures are accepted even when file.type is empty or aliased", async () => {
  assert.equal((await validateProductImage(fakeFile(jpeg, ""))).ok, true);
  assert.equal((await validateProductImage(fakeFile(jpeg, "image/jpg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(jpeg, "image/jpeg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(png, "image/png"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(webp, "image/webp"))).ok, true);
});

test("SVG HTML oversized and mismatched types are rejected", async () => {
  assert.equal((await validateProductImage(fakeFile(Buffer.from("<svg>"), "image/svg+xml"))).ok, false);
  assert.equal((await validateProductImage(fakeFile(Buffer.from("<html>"), "text/html"))).code, "invalid_image_type");
  assert.equal((await validateProductImage(fakeFile(jpeg, "image/png"))).ok, false);
  assert.equal(
    (await validateProductImage(fakeFile(jpeg, "image/jpeg", IMAGE_LIMITS.sourceBytes + 1))).code,
    "invalid_image_size"
  );
  assert.equal(detectImageMime(Buffer.from("<svg>")), "");
});

test("upload rejects missing store or product UUID instead of throwing", async () => {
  const result = await uploadProductImage(fakeFile(jpeg, "image/jpeg"), "", productId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "store_unbound");
  const missingProduct = await uploadProductImage(fakeFile(jpeg, "image/jpeg"), storeId, "not-a-uuid");
  assert.equal(missingProduct.code, "product_save_failed");
});

test("storage HTTP errors map to actionable codes", () => {
  assert.equal(storageHttpErrorCode(0), "image_network_failed");
  assert.equal(storageHttpErrorCode(401), "session_expired");
  assert.equal(storageHttpErrorCode(403), "storage_forbidden");
  assert.equal(storageHttpErrorCode(413), "invalid_image_size");
  assert.equal(storageHttpErrorCode(500), "image_upload_failed");
});

test("paths stay store/product/uuid.webp and can be masked for logs", () => {
  const fileId = "123e4567-e89b-42d3-a456-426614174002";
  const path = buildProductImagePath(storeId, productId, fileId);
  assert.equal(path, `${storeId}/${productId}/${fileId}.webp`);
  assert.equal(isValidProductImagePath(path, storeId), true);
  assert.equal(isUuid(storeId), true);
  assert.match(maskStoragePath(path), /123e4567…/);
  assert.doesNotMatch(maskStoragePath(path), /426614174000/);
});

test("storage migration is idempotent and scoped to authenticated owners", async () => {
  const sql = await readFile(new URL("../supabase/migrations/011_product_image_storage.sql", import.meta.url), "utf8");
  assert.match(sql, /drop policy if exists product_images_insert_owner/);
  assert.match(sql, /to authenticated/);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.doesNotMatch(sql, /alter table storage\.objects/i);
  assert.match(sql, /drop policy if exists "test upload product images"/);
});
