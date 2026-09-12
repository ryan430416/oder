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

function fakeFile(bytes, type, size, name = "photo.bin") {
  const buffer = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    name,
    size: size ?? buffer.byteLength,
    type,
    slice(start = 0, end = buffer.byteLength) {
      const part = buffer.slice(start, end);
      return {
        arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
      };
    },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from(Buffer.from("RIFF0000WEBP1234"));
const storeId = "123e4567-e89b-42d3-a456-426614174000";
const productId = "123e4567-e89b-42d3-a456-426614174001";

test("JPEG PNG and WebP signatures are accepted even when file.type is empty or aliased", async () => {
  const offsetJpeg = new Uint8Array(24);
  offsetJpeg.set(jpeg, 4);
  assert.equal(detectImageMime(offsetJpeg.subarray(4)), "image/jpeg");
  assert.equal((await validateProductImage(fakeFile(jpeg, ""))).ok, true);
  assert.equal((await validateProductImage(fakeFile(jpeg, "image/jpg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(jpeg, "image/jpeg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(jpeg, "application/octet-stream"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(png, "image/png"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(webp, "image/webp"))).ok, true);
});

test("standard, EXIF, palette, and disguised images follow magic bytes", async () => {
  const { photoSelectionResult } = await import("../js/admin-data.js");
  const exif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 16, 0x45, 0x78, 0x69, 0x66, 0, 0, 0, 0, 0, 0]);
  const jfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0]);
  const palette = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 3, 0, 0, 0,
  ]);
  assert.equal((await validateProductImage(fakeFile(jfif, "image/jpeg", undefined, "meal.jpg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(exif, "image/jpeg", undefined, "exif.jpg"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(png, "image/png", undefined, "meal.png"))).mime, "image/png");
  assert.equal((await validateProductImage(fakeFile(palette, "image/png", undefined, "palette.png"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(webp, "image/webp", undefined, "meal.webp"))).ok, true);
  assert.equal((await validateProductImage(fakeFile(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png", undefined, "fake.png"))).ok, false);
  assert.equal((await validateProductImage(fakeFile(Buffer.from("<svg/>"), "image/svg+xml", undefined, "icon.svg"))).code, "invalid_image_type");
  assert.equal(
    (await validateProductImage(fakeFile(jpeg, "image/jpeg", IMAGE_LIMITS.sourceBytes + 1, "huge.jpg"))).code,
    "invalid_image_size"
  );
  const failed = photoSelectionResult({ ok: false, code: "invalid_image_type" });
  assert.equal(failed.retry, false);
  assert.equal(failed.preview, false);
  const recovered = photoSelectionResult(await validateProductImage(fakeFile(png, "image/png")));
  assert.equal(recovered.preview, true);
  assert.equal(recovered.remove, true);
  assert.equal(recovered.retry, false);
  assert.equal(recovered.message, "image_ready");
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

test("PocketBase product image field is owner-scoped and size-limited", async () => {
  const schema = await readFile(
    new URL("../pocketbase/pb_migrations/1700000001_init_collections.js", import.meta.url),
    "utf8"
  );
  assert.match(schema, /maxSize: 1048576/);
  assert.match(schema, /mimeTypes: \["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(schema, /store = @request\.auth\.store/);
  assert.match(schema, /createRule:\s*null/);
});
