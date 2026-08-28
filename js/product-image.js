import { config, loadConfig } from "./config.js";
import { getSupabase } from "./supabase.js";

export const IMAGE_LIMITS = {
  sourceBytes: 8 * 1024 * 1024,
  outputBytes: 1024 * 1024,
  maxEdge: 1600,
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function detectImageMime(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  const ascii = (start, end) =>
    String.fromCharCode(...b.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return "";
}

export async function validateProductImage(file) {
  if (!file || !file.size || file.size > IMAGE_LIMITS.sourceBytes) {
    return { ok: false, code: "invalid_image_size" };
  }
  const actualMime = detectImageMime(await file.slice(0, 16).arrayBuffer());
  if (!ALLOWED_MIME.has(actualMime) || !ALLOWED_MIME.has(file.type) || actualMime !== file.type) {
    return { ok: false, code: "invalid_image_type" };
  }
  return { ok: true, mime: actualMime };
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image_encode_failed"))),
      "image/webp",
      quality
    );
  });
}

export async function compressProductImage(file) {
  const validation = await validateProductImage(file);
  if (!validation.ok) return validation;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, IMAGE_LIMITS.maxEdge / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    let quality = 0.82;
    let blob;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= IMAGE_LIMITS.outputBytes) break;
      quality = Math.max(0.55, quality - 0.07);
      width = Math.max(1, Math.round(width * 0.88));
      height = Math.max(1, Math.round(height * 0.88));
    }
    if (!blob || blob.size > IMAGE_LIMITS.outputBytes) {
      return { ok: false, code: "image_compress_failed" };
    }
    return { ok: true, blob, width, height, mime: "image/webp" };
  } catch (error) {
    console.error("Image compression failed", error);
    return { ok: false, code: "image_compress_failed" };
  } finally {
    bitmap?.close?.();
  }
}

export function buildProductImagePath(storeId, productId, fileId = crypto.randomUUID()) {
  if (![storeId, productId, fileId].every((value) => UUID_PATTERN.test(String(value)))) {
    throw new Error("invalid_image_path");
  }
  return `${storeId}/${productId}/${fileId}.webp`;
}

export function isValidProductImagePath(path, storeId = "") {
  const parts = String(path || "").split("/");
  return (
    parts.length === 3 &&
    UUID_PATTERN.test(parts[0]) &&
    UUID_PATTERN.test(parts[1]) &&
    /^[0-9a-f-]{36}\.webp$/i.test(parts[2]) &&
    (!storeId || parts[0] === storeId)
  );
}

function uploadBlob(path, blob, onProgress) {
  return new Promise(async (resolve) => {
    await loadConfig();
    const client = await getSupabase();
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return resolve({ ok: false, code: "session_expired" });

    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `${config.SUPABASE_URL}/storage/v1/object/product-images/${path}`
    );
    request.setRequestHeader("apikey", config.SUPABASE_ANON_KEY);
    request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.setRequestHeader("Content-Type", "image/webp");
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => resolve({ ok: false, code: "image_upload_failed" });
    request.onload = () =>
      resolve(
        request.status >= 200 && request.status < 300
          ? { ok: true, path }
          : { ok: false, code: "image_upload_failed" }
      );
    request.send(blob);
  });
}

export async function uploadProductImage(file, storeId, productId, options = {}) {
  const compressed = await compressProductImage(file);
  if (!compressed.ok) return compressed;
  const path = buildProductImagePath(storeId, productId);
  return uploadBlob(path, compressed.blob, options.onProgress);
}

export async function deleteProductImage(path) {
  if (!path) return { ok: true };
  const client = await getSupabase();
  const { error } = await client.storage.from("product-images").remove([path]);
  return error ? { ok: false, code: "image_delete_failed" } : { ok: true };
}
