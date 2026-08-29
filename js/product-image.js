import { config, loadConfig } from "./config.js";
import { getSupabase } from "./supabase.js";

export const PRODUCT_IMAGE_BUCKET = "product-images";

export const IMAGE_LIMITS = {
  sourceBytes: 8 * 1024 * 1024,
  outputBytes: 1024 * 1024,
  maxEdge: 1600,
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECLARED_TYPE_ALIAS = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};

export function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

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
  const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return "";
}

function normalizeDeclaredType(type) {
  const value = String(type || "").trim().toLowerCase();
  return DECLARED_TYPE_ALIAS[value] || value;
}

export async function validateProductImage(file) {
  if (!file || !file.size) return { ok: false, code: "invalid_image_type" };
  if (file.size > IMAGE_LIMITS.sourceBytes) return { ok: false, code: "invalid_image_size" };
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const actualMime = detectImageMime(header);
  if (!ALLOWED_MIME.has(actualMime)) return { ok: false, code: "invalid_image_type" };
  const declared = normalizeDeclaredType(file.type);
  if (declared && declared !== actualMime) return { ok: false, code: "invalid_image_type" };
  return { ok: true, mime: actualMime };
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("image_encode_failed"));
      return;
    }
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("image_encode_failed"))),
      "image/webp",
      quality
    );
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }
  throw new Error("image_compress_failed");
}

export async function compressProductImage(file) {
  try {
    const validation = await validateProductImage(file);
    if (!validation.ok) return validation;
    let bitmap;
    try {
      bitmap = await decodeImage(file);
      const scale = Math.min(1, IMAGE_LIMITS.maxEdge / Math.max(bitmap.width, bitmap.height));
      let width = Math.max(1, Math.round(bitmap.width * scale));
      let height = Math.max(1, Math.round(bitmap.height * scale));
      let quality = 0.8;
      let blob;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return { ok: false, code: "image_compress_failed" };
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        blob = await canvasBlob(canvas, quality);
        if (blob.size > 0 && blob.size <= IMAGE_LIMITS.outputBytes) break;
        quality = Math.max(0.55, quality - 0.07);
        width = Math.max(1, Math.round(width * 0.88));
        height = Math.max(1, Math.round(height * 0.88));
      }
      if (!blob || blob.size <= 0) return { ok: false, code: "image_compress_failed" };
      if (blob.size > IMAGE_LIMITS.outputBytes) return { ok: false, code: "image_compress_failed" };
      const mime = blob.type || "image/webp";
      if (mime !== "image/webp") return { ok: false, code: "image_compress_failed" };
      return { ok: true, blob, width, height, mime };
    } finally {
      bitmap?.close?.();
    }
  } catch (error) {
    console.error("Image compression failed", error);
    return { ok: false, code: "image_compress_failed" };
  }
}

export function buildProductImagePath(storeId, productId, fileId = crypto.randomUUID()) {
  if (![storeId, productId, fileId].every((value) => isUuid(value))) {
    throw new Error("invalid_image_path");
  }
  return `${storeId}/${productId}/${fileId}.webp`;
}

export function isValidProductImagePath(path, storeId = "") {
  const parts = String(path || "").split("/");
  return (
    parts.length === 3 &&
    isUuid(parts[0]) &&
    isUuid(parts[1]) &&
    /^[0-9a-f-]{36}\.webp$/i.test(parts[2]) &&
    (!storeId || parts[0] === storeId)
  );
}

export function maskStoragePath(path) {
  return String(path || "")
    .split("/")
    .map((part) => (part.length <= 8 ? part : `${part.slice(0, 8)}…`))
    .join("/");
}

function debugUpload(details) {
  if (config.APP_ENV === "production") return;
  console.info("[product-image]", {
    stage: details.stage,
    bucket: PRODUCT_IMAGE_BUCKET,
    path: details.path ? maskStoragePath(details.path) : undefined,
    status: details.status,
    code: details.code,
  });
}

export function storageHttpErrorCode(status) {
  if (!status) return "image_network_failed";
  if (status === 401) return "session_expired";
  if (status === 403) return "storage_forbidden";
  if (status === 413) return "invalid_image_size";
  return "image_upload_failed";
}

function uploadBlob(path, blob, onProgress) {
  return new Promise(async (resolve) => {
    try {
      await loadConfig();
      const client = await getSupabase();
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        debugUpload({ stage: "auth", path, code: "session_expired" });
        resolve({ ok: false, code: "session_expired" });
        return;
      }
      const request = new XMLHttpRequest();
      request.open("POST", `${config.SUPABASE_URL}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${path}`);
      request.setRequestHeader("apikey", config.SUPABASE_ANON_KEY);
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("Content-Type", "image/webp");
      request.setRequestHeader("x-upsert", "false");
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => {
        debugUpload({ stage: "upload-network", path, status: request.status, code: "image_network_failed" });
        resolve({ ok: false, code: "image_network_failed" });
      };
      request.onload = () => {
        const ok = request.status >= 200 && request.status < 300;
        let remoteCode = "";
        try {
          remoteCode = JSON.parse(request.responseText || "{}").error || JSON.parse(request.responseText || "{}").statusCode || "";
        } catch {
          remoteCode = "";
        }
        debugUpload({
          stage: "upload-response",
          path,
          status: request.status,
          code: ok ? "ok" : remoteCode || storageHttpErrorCode(request.status),
        });
        resolve(ok ? { ok: true, path } : { ok: false, code: storageHttpErrorCode(request.status) });
      };
      debugUpload({ stage: "upload-start", path });
      request.send(blob);
    } catch (error) {
      console.error("Image upload failed", error);
      resolve({ ok: false, code: "image_upload_failed" });
    }
  });
}

export async function uploadProductImage(file, storeId, productId, options = {}) {
  try {
    if (!isUuid(storeId)) return { ok: false, code: "store_unbound" };
    if (!isUuid(productId)) return { ok: false, code: "product_save_failed" };
    const compressed = await compressProductImage(file);
    if (!compressed.ok) return compressed;
    debugUpload({ stage: "compress", path: `${storeId}/${productId}`, code: "ok" });
    const path = buildProductImagePath(storeId, productId);
    return uploadBlob(path, compressed.blob, options.onProgress);
  } catch (error) {
    console.error("Image upload failed", error);
    return { ok: false, code: error?.message === "invalid_image_path" ? "store_unbound" : "image_upload_failed" };
  }
}

export async function deleteProductImage(path) {
  if (!path) return { ok: true };
  try {
    const client = await getSupabase();
    const { error } = await client.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    if (error) {
      debugUpload({ stage: "delete", path, code: error.message || "image_delete_failed" });
      return { ok: false, code: "image_delete_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("Image delete failed", error);
    return { ok: false, code: "image_delete_failed" };
  }
}
