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
    slice() {
      return {
        arrayBuffer: async () => buffer.slice().buffer,
      };
    },
  };
}

test("1x1 images are rejected before upload", async () => {
  assert.equal(isUsableImageDimension(1, 1), false);
  assert.equal(isUsableImageDimension(99, 120), false);
  assert.equal(isUsableImageDimension(100, 100), true);
  assert.ok(IMAGE_LIMITS.minEdge >= 100);
  assert.ok(IMAGE_LIMITS.minOutputBytes >= 500);
  // Node has no canvas/document; compress must fail closed instead of uploading 1x1.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const compressed = await compressProductImage(fakeFile(tinyPng, "image/png"));
  assert.equal(compressed.ok, false);
  assert.ok(["image_compress_failed", "invalid_image_type"].includes(compressed.code));
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

test("lightbox markup source does not ship empty img src", async () => {
  const source = await readFile(new URL("../js/image-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML = '<button[^>]*>×<\/button><img alt="" \/>'/);
  assert.match(source, /removeAttribute\("src"\)/);
  assert.match(source, /Escape/);
  assert.match(source, /naturalWidth/);
});
