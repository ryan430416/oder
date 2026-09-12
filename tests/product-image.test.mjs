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

const storeId = "123e4567-e89b-42d3-a456-426614174000";
const productId = "123e4567-e89b-42d3-a456-426614174001";

async function fixtureFile(name, type) {
  const bytes = await readFile(new URL(`./fixtures/images/${name}`, import.meta.url));
  return new File([bytes], name, { type });
}

test("real JPEG PNG and WebP fixtures pass File.type and Uint8Array magic checks", async () => {
  const jpeg = await fixtureFile("standard.jpg", "image/jpeg");
  const png = await fixtureFile("standard.png", "image/png");
  const palette = await fixtureFile("palette.png", "image/png");
  const webp = await fixtureFile("standard.webp", "image/webp");
  for (const file of [jpeg, png, palette, webp]) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    assert.equal(bytes.buffer instanceof ArrayBuffer, true);
    const result = await validateProductImage(file);
    assert.equal(result.ok, true, file.name);
    assert.equal(result.mime, file.type);
  }
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  assert.equal(jpegBytes[0], 0xff);
  assert.equal(jpegBytes[1], 0xd8);
  assert.equal(jpegBytes[2], 0xff);
  assert.equal(detectImageMime(jpegBytes), "image/jpeg");
  const pngBytes = new Uint8Array(await png.arrayBuffer());
  assert.deepEqual([...pngBytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const paletteBytes = new Uint8Array(await palette.arrayBuffer());
  assert.equal(paletteBytes[25], 3);
  const webpBytes = new Uint8Array(await webp.arrayBuffer());
  assert.equal(String.fromCharCode(...webpBytes.subarray(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...webpBytes.subarray(8, 12)), "WEBP");
});

test("disguised SVG files and oversized files are rejected", async () => {
  const fake = await fixtureFile("fake.png", "image/png");
  const svg = await fixtureFile("icon.svg", "image/svg+xml");
  assert.equal((await validateProductImage(fake)).code, "invalid_image_type");
  assert.equal((await validateProductImage(svg)).code, "invalid_image_type");
  const jpeg = await fixtureFile("standard.jpg", "image/jpeg");
  const huge = new File([await jpeg.arrayBuffer(), new Uint8Array(IMAGE_LIMITS.sourceBytes)], "huge.jpg", {
    type: "image/jpeg",
  });
  assert.equal((await validateProductImage(huge)).code, "invalid_image_size");
});

test("a failed selection can be replaced by a real PNG without keeping retry", async () => {
  const { photoSelectionResult } = await import("../js/admin-data.js");
  const failed = photoSelectionResult({ ok: false, code: "invalid_image_type" });
  assert.equal(failed.preview, false);
  assert.equal(failed.retry, false);
  const recovered = photoSelectionResult(await validateProductImage(await fixtureFile("standard.png", "image/png")));
  assert.equal(recovered.preview, true);
  assert.equal(recovered.remove, true);
  assert.equal(recovered.retry, false);
  assert.equal(recovered.message, "image_ready");
});

test("upload rejects missing store or product UUID instead of throwing", async () => {
  const file = await fixtureFile("standard.jpg", "image/jpeg");
  const result = await uploadProductImage(file, "", productId);
  assert.equal(result.ok, false);
  assert.equal(result.code, "store_unbound");
  const missingProduct = await uploadProductImage(file, storeId, "not-a-uuid");
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
