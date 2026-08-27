import { config } from "./config.js";
import { getSupabase } from "./supabase.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE = 5 * 1024 * 1024;

export async function uploadProductImage(file, storeId) {
  if (!file || !file.size) return { ok: true, url: "" };
  if (!ALLOWED.has(file.type) || file.size > MAX_SIZE) {
    return { ok: false, code: "invalid_image" };
  }
  if (config.USE_MOCK) {
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { ok: true, url };
  }
  try {
    const client = await getSupabase();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await client.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) return { ok: false, code: "image_upload_failed" };
    const { data } = client.storage.from("product-images").getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  } catch {
    return { ok: false, code: "image_upload_failed" };
  }
}
