import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  IMAGE_LIMITS,
  isUsableImageDimension,
  compressProductImage,
} from "../js/product-image.js";
import { applyProductImageFallback } from "../js/image-ui.js";
import { DEFAULT_PRODUCT_IMAGE } from "../js/html.js";

function fakeFile(bytes, type, size) {
  const buffer = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    size: size ?? buffer.byteLength,
    type,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    slice() {
      return {
        arrayBuffer: async () => buffer.slice().buffer,
      };
    },
  };
}

test("sub-400 images are rejected before upload", async () => {
  assert.equal(isUsableImageDimension(1, 1), false);
  assert.equal(isUsableImageDimension(128, 128), false);
  assert.equal(isUsableImageDimension(399, 400), false);
  assert.equal(isUsableImageDimension(400, 400), true);
  assert.equal(IMAGE_LIMITS.minEdge, 400);
  assert.equal(IMAGE_LIMITS.maxEdge, 1600);
  assert.ok(IMAGE_LIMITS.minOutputBytes >= 500);
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const compressed = await compressProductImage(fakeFile(tinyPng, "image/png"));
  assert.equal(compressed.ok, false);
  assert.ok(["image_compress_failed", "image_too_small", "invalid_image_type"].includes(compressed.code));
});

test("compress path never forces 128×128 or 1×1 canvas", async () => {
  const source = await readFile(new URL("../js/product-image.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /128\s*\*\s*128|width\s*=\s*128|height\s*=\s*128/);
  assert.doesNotMatch(source, /width\s*=\s*1\s*;|height\s*=\s*1\s*;/);
  assert.match(source, /maxEdge:\s*1600/);
  assert.match(source, /minEdge:\s*400/);
});

test("tiny loaded photos fall back to default meal image", () => {
  const image = {
    naturalWidth: 1,
    naturalHeight: 1,
    dataset: { defaultSrc: DEFAULT_PRODUCT_IMAGE },
    removeAttribute() {},
    setAttribute(name, value) {
      if (name === "src") this.src = value;
    },
    closest() {
      return null;
    },
  };
  applyProductImageFallback(image);
  assert.equal(image.src, DEFAULT_PRODUCT_IMAGE);
  assert.equal(image.dataset.fallbackApplied, "1");
});

test("lightbox does not keep a dormant empty-src img", async () => {
  const source = await readFile(new URL("../js/image-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML = '<button[^>]*>×<\/button><img/);
  assert.doesNotMatch(source, /createElement\("img"\);\s*\n\s*preview\.hidden/);
  assert.match(source, /preview = document\.createElement\("img"\)/);
  assert.match(source, /preview\.remove\(\)/);
  assert.match(source, /Escape/);
  assert.match(source, /closeButton\.focus/);
  assert.match(source, /aria-label/);
  assert.match(source, /role", "dialog"/);
  assert.match(source, /aria-modal", "true"/);
  assert.match(source, /lastFocus = trigger/);
  assert.match(source, /inert/);
});

test("category buttons expose aria-pressed in customer store", async () => {
  const source = await readFile(new URL("../js/pages/customer-store.js", import.meta.url), "utf8");
  assert.match(source, /aria-pressed="\$\{pressed \? "true" : "false"\}"/);
});

test("seed meal image is at least 400px and not 128", async () => {
  const source = await readFile(new URL("../scripts/seed-demo-catalog.mjs", import.meta.url), "utf8");
  assert.match(source, /mealPngBytes\(800\)/);
  assert.doesNotMatch(source, /mealPngBytes\(128\)/);
  assert.doesNotMatch(source, /mealPngBytes\(1\)/);
});
