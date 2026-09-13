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
  validateImageSignature,
  validateProductImage,
} from "../js/product-image.js";

const storeId = "123e4567-e89b-42d3-a456-426614174000";
const productId = "123e4567-e89b-42d3-a456-426614174001";

async function fixtureFile(name, type) {
  const bytes = await readFile(new URL(`./fixtures/images/${name}`, import.meta.url));
  return new File([bytes], name, { type });
}

function pngSize(bytes) {
  return {
    width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
    height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
  };
}

test("validateImageSignature accepts a real 256x256 PNG by numeric magic bytes", async () => {
  const file = await fixtureFile("square-256.png", "image/png");
  const header = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(header);
  assert.equal(header instanceof ArrayBuffer, true);
  assert.equal(bytes instanceof Uint8Array, true);
  assert.equal(typeof bytes[0], "number");
  assert.deepEqual(
    [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
  assert.equal(bytes[0] === "137", false);
  assert.equal(bytes[0] === "\\x89", false);
  const full = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual(pngSize(full), { width: 256, height: 256 });
  const signature = await validateImageSignature(file);
  assert.equal(signature.ok, true);
  assert.equal(signature.mime, "image/png");
  const result = await validateProductImage(file);
  assert.equal(result.ok, true);
  assert.equal(result.mime, "image/png");
});

test("validateImageSignature accepts JPEG by FF D8 FF and WebP by RIFF/WEBP", async () => {
  const jpeg = await fixtureFile("square-256.jpg", "image/jpeg");
  const jpegBytes = new Uint8Array(await jpeg.slice(0, 16).arrayBuffer());
  assert.equal(jpegBytes[0], 0xff);
  assert.equal(jpegBytes[1], 0xd8);
  assert.equal(jpegBytes[2], 0xff);
  assert.equal((await validateImageSignature(jpeg)).mime, "image/jpeg");
  assert.equal((await validateProductImage(jpeg)).ok, true);

  const noJfif = await fixtureFile("nojfif.jpg", "image/jpeg");
  const noJfifBytes = new Uint8Array(await noJfif.slice(0, 16).arrayBuffer());
  assert.equal(noJfifBytes[3], 0xdb);
  assert.notEqual(String.fromCharCode(noJfifBytes[6], noJfifBytes[7], noJfifBytes[8], noJfifBytes[9]), "JFIF");
  assert.equal((await validateImageSignature(noJfif)).mime, "image/jpeg");

  const webp = await fixtureFile("standard.webp", "image/webp");
  const webpBytes = new Uint8Array(await webp.slice(0, 16).arrayBuffer());
  assert.deepEqual([webpBytes[0], webpBytes[1], webpBytes[2], webpBytes[3]], [0x52, 0x49, 0x46, 0x46]);
  assert.deepEqual([webpBytes[8], webpBytes[9], webpBytes[10], webpBytes[11]], [0x57, 0x45, 0x42, 0x50]);
  assert.equal((await validateImageSignature(webp)).mime, "image/webp");
  assert.equal((await validateProductImage(webp)).ok, true);
});

test("signature check rejects string or ArrayBuffer comparisons", async () => {
  const source = await readFile(new URL("../js/product-image.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function validateImageSignature");
  const end = source.indexOf("function normalizeDeclaredType");
  const fn = source.slice(start, end);
  assert.match(fn, /file\.slice\(0, 16\)\.arrayBuffer\(\)/);
  assert.match(fn, /new Uint8Array\(/);
  assert.doesNotMatch(fn, /readAsBinaryString|fromCharCode|TextDecoder/);
  assert.doesNotMatch(fn, /===\s*["']\\x89|===\s*["']89 50/);
  const file = await fixtureFile("square-256.png", "image/png");
  const wrongType = new File([await file.arrayBuffer()], "square-256.png", { type: "image/jpeg" });
  assert.equal((await validateImageSignature(wrongType)).mime, "image/png");
  assert.equal((await validateProductImage(wrongType)).code, "invalid_image_type");
});

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
