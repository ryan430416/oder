import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_RULES } from "../pocketbase/collection-rules.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  const text = await readFile(join(root, ".env"), "utf8").catch(() => "");
  const env = { ...process.env };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function tinyPngBytes() {
  // 1x1 PNG (opaque peach) for product image seed tests.
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

async function request(url, path, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

async function login(url, email, password) {
  for (const path of [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ]) {
    const result = await request(url, path, {
      method: "POST",
      body: { identity: email, password },
    });
    if (result.ok && result.data.token) return result.data.token;
  }
  throw new Error("Unable to login PocketBase superuser from .env");
}

async function findFirst(url, token, collection, filter) {
  const result = await request(
    url,
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=1`,
    { token }
  );
  return result.data.items?.[0] || null;
}

async function upsert(url, token, collection, filter, payload) {
  const existing = await findFirst(url, token, collection, filter);
  if (existing) {
    const updated = await request(url, `/api/collections/${collection}/records/${existing.id}`, {
      method: "PATCH",
      token,
      body: payload,
    });
    if (!updated.ok) throw new Error(`update ${collection} failed: ${JSON.stringify(updated.data)}`);
    return updated.data;
  }
  const created = await request(url, `/api/collections/${collection}/records`, {
    method: "POST",
    token,
    body: payload,
  });
  if (!created.ok) throw new Error(`create ${collection} failed: ${JSON.stringify(created.data)}`);
  return created.data;
}

async function ensureProduct(url, token, storeId, name, fields) {
  return upsert(url, token, "products", `store="${storeId}" && name="${name}"`, {
    store: storeId,
    name,
    ...fields,
  });
}

const env = await loadEnv();
const url = String(env.POCKETBASE_URL || "").replace(/\/$/, "");
const appEnv = env.APP_ENV || "development";
const email = env.POCKETBASE_ADMIN_EMAIL || "";
const password = env.POCKETBASE_ADMIN_PASSWORD || "";

if (!url) throw new Error("Set POCKETBASE_URL in .env");
if (!email || !password) throw new Error("Set POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD in .env");
if (appEnv === "production" && env.ALLOW_TEST_SEED !== "true") {
  throw new Error("Refusing to seed demo stores when APP_ENV=production (set ALLOW_TEST_SEED=true to override).");
}

const token = await login(url, email, password);

for (const [name, rules] of Object.entries(COLLECTION_RULES)) {
  const listed = await request(url, `/api/collections/${name}`, { token });
  if (!listed.ok) continue;
  await request(url, `/api/collections/${listed.data.id}`, {
    method: "PATCH",
    token,
    body: rules,
  });
}

const openStore = await upsert(url, token, "stores", 'name="中央食堂"', {
  name: "中央食堂",
  description: "測試用營業店家：便當與飲料",
  image_url: "🍱",
  open_time: "08:35",
  close_time: "18:25",
  service_periods: ["breakfast", "lunch", "afternoon_tea"],
  status: "open",
});

const closedStore = await upsert(url, token, "stores", 'name="暫停營業店"', {
  name: "暫停營業店",
  description: "測試用：顧客不應看到",
  image_url: "🏪",
  open_time: "08:35",
  close_time: "18:25",
  service_periods: ["breakfast", "lunch", "afternoon_tea"],
  status: "closed",
});

const withImage = await ensureProduct(url, token, openStore.id, "雞腿便當", {
  category: "便當",
  description: "有圖片的 active 商品",
  price: 75,
  status: "active",
});

const noImage = await ensureProduct(url, token, openStore.id, "燙青菜", {
  category: "配菜",
  description: "無圖片，應顯示預設圖",
  price: 30,
  status: "active",
});

const soldout = await ensureProduct(url, token, openStore.id, "每日特餐", {
  category: "便當",
  description: "soldout，不可加入購物車",
  price: 90,
  status: "soldout",
});

await ensureProduct(url, token, closedStore.id, "隱藏餐點", {
  category: "其他",
  description: "停用店不應被顧客看到",
  price: 50,
  status: "active",
});

const form = new FormData();
form.append("image", new Blob([tinyPngBytes()], { type: "image/png" }), "meal.png");
const upload = await request(url, `/api/collections/products/records/${withImage.id}`, {
  method: "PATCH",
  token,
  form,
});
if (!upload.ok) throw new Error(`image upload failed: ${JSON.stringify(upload.data)}`);

const storeUser = await upsert(url, token, "oder_users", 'email="shop1@campus-order.test"', {
  email: "shop1@campus-order.test",
  password: "1234",
  passwordConfirm: "1234",
  verified: true,
  display_name: "中央食堂店家",
  name: "中央食堂店家",
  role: "store",
  store: openStore.id,
  status: "active",
});

const admin = await upsert(url, token, "oder_users", 'email="admin@campus-order.test"', {
  email: "admin@campus-order.test",
  password: "1234",
  passwordConfirm: "1234",
  verified: true,
  display_name: "測試管理員",
  name: "測試管理員",
  role: "admin",
  status: "active",
});

console.log(
  JSON.stringify(
    {
      open_store: openStore.id,
      closed_store: closedStore.id,
      products: {
        with_image: withImage.id,
        no_image: noImage.id,
        soldout: soldout.id,
        image_filename: upload.data.image,
      },
      store_login: "shop1 / 1234",
      admin_login: "admin / 1234",
      users: { store: storeUser.id, admin: admin.id },
    },
    null,
    2
  )
);
console.log("Demo catalog seeded.");
