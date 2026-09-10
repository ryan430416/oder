import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_RULES } from "../pocketbase/collection-rules.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  const text = await readFile(join(root, ".env"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function request(url, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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
  const attempts = [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ];
  for (const path of attempts) {
    const result = await request(url, path, {
      method: "POST",
      body: JSON.stringify({ identity: email, password }),
    });
    if (result.ok && result.data.token) return result.data.token;
  }
  throw new Error("後台帳密無法登入。請確認是 https://db.keson.pro/_/ 的 Superuser，不是點餐網站的 admin。");
}

function autodate() {
  return [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];
}

async function listCollections(url, token) {
  const result = await request(url, "/api/collections?perPage=200", {
    headers: { Authorization: token },
  });
  if (!result.ok) throw new Error(`無法列出 collections: ${JSON.stringify(result.data)}`);
  return result.data.items || [];
}

async function createCollection(url, token, body) {
  const result = await request(url, "/api/collections", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(`建立 ${body.name} 失敗: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function getCollection(url, token, id) {
  const result = await request(url, `/api/collections/${id}`, {
    headers: { Authorization: token },
  });
  if (!result.ok) throw new Error(`無法讀取 collection: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function updateCollection(url, token, id, body) {
  const result = await request(url, `/api/collections/${id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: JSON.stringify(body),
  });
  if (!result.ok) throw new Error(`更新 ${id} 失敗: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function ensureRecord(url, token, collection, filter, payload) {
  const listed = await request(
    url,
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=1`,
    { headers: { Authorization: token } }
  );
  const existing = listed.data.items?.[0];
  if (existing) {
    const updated = await request(url, `/api/collections/${collection}/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token },
      body: JSON.stringify(payload),
    });
    if (!updated.ok) throw new Error(`更新測試管理員失敗: ${JSON.stringify(updated.data)}`);
    return existing.id;
  }
  const created = await request(url, `/api/collections/${collection}/records`, {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify(payload),
  });
  if (!created.ok) throw new Error(`建立測試管理員失敗: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

const env = await loadEnv();
const url = (env.POCKETBASE_URL || "").replace(/\/$/, "");
const email = env.POCKETBASE_ADMIN_EMAIL || "";
const password = env.POCKETBASE_ADMIN_PASSWORD || "";
if (!url) throw new Error("請在 .env 設定 POCKETBASE_URL");
if (!email || !password) throw new Error("請在 .env 填 POCKETBASE_ADMIN_EMAIL 與 POCKETBASE_ADMIN_PASSWORD 後再執行。");

const token = await login(url, email, password);
let collections = await listCollections(url, token);
const byName = () => Object.fromEntries(collections.map((item) => [item.name, item]));

async function ensure(name, body) {
  if (byName()[name]) {
    console.log(`skip ${name}`);
    return byName()[name];
  }
  const created = await createCollection(url, token, body);
  collections = await listCollections(url, token);
  console.log(`created ${name}`);
  return created;
}

await ensure("oder_users", {
  name: "oder_users",
  type: "auth",
  ...COLLECTION_RULES.oder_users,
  passwordAuth: { enabled: true, identityFields: ["email"] },
  fields: [
    { name: "display_name", type: "text", max: 80 },
    { name: "grade", type: "select", values: ["high_1", "high_2", "high_3"], maxSelect: 1 },
    { name: "role", type: "select", required: true, values: ["customer", "store", "admin"], maxSelect: 1 },
    { name: "status", type: "select", required: true, values: ["active", "disabled"], maxSelect: 1 },
  ],
});

const stores = await ensure("stores", {
  name: "stores",
  type: "base",
  ...COLLECTION_RULES.stores,
  fields: [
    { name: "name", type: "text", required: true, min: 1, max: 80, presentable: true },
    { name: "description", type: "text", max: 500 },
    { name: "image_url", type: "text", max: 500 },
    { name: "open_time", type: "text", required: true, max: 5 },
    { name: "close_time", type: "text", required: true, max: 5 },
    { name: "service_periods", type: "select", maxSelect: 3, values: ["breakfast", "lunch", "afternoon_tea"] },
    { name: "status", type: "select", required: true, maxSelect: 1, values: ["open", "closed", "disabled"] },
    ...autodate(),
  ],
});

const users = byName().oder_users;
if (users && !users.fields?.some((field) => field.name === "store")) {
  await updateCollection(url, token, users.id, {
    fields: [
      ...(users.fields || []),
      {
        name: "store",
        type: "relation",
        collectionId: stores.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
  });
  collections = await listCollections(url, token);
  console.log("updated oder_users.store");
}

await ensure("products", {
  name: "products",
  type: "base",
  ...COLLECTION_RULES.products,
  fields: [
    { name: "store", type: "relation", required: true, collectionId: stores.id, cascadeDelete: false, maxSelect: 1 },
    { name: "name", type: "text", required: true, min: 1, max: 100, presentable: true },
    { name: "category", type: "text", required: true, min: 1, max: 40 },
    { name: "description", type: "text", max: 500 },
      { name: "price", type: "number", required: true, min: 0, onlyInt: true },
    {
      name: "image",
      type: "file",
      maxSelect: 1,
      maxSize: 1048576,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      protected: false,
    },
    { name: "status", type: "select", required: true, maxSelect: 1, values: ["active", "soldout", "hidden"] },
    ...autodate(),
  ],
  indexes: ["CREATE INDEX idx_products_store_status ON products (store, status)"],
});

const usersId = byName().oder_users.id;
const products = byName().products;

const orders = await ensure("orders", {
  name: "orders",
  type: "base",
  ...COLLECTION_RULES.orders,
  fields: [
    { name: "order_number", type: "text", required: true, max: 40 },
    { name: "customer", type: "relation", required: true, collectionId: usersId, cascadeDelete: false, maxSelect: 1 },
    { name: "customer_name", type: "text", required: true, min: 1, max: 80 },
    { name: "customer_grade", type: "select", values: ["high_1", "high_2", "high_3"], maxSelect: 1 },
    { name: "store", type: "relation", required: true, collectionId: stores.id, cascadeDelete: false, maxSelect: 1 },
    { name: "pickup_time", type: "date", required: true },
    { name: "payment_method", type: "select", required: true, maxSelect: 1, values: ["cash", "campus"] },
      { name: "total", type: "number", required: true, min: 0, onlyInt: true },
    {
      name: "status",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["pending", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"],
    },
    { name: "idempotency_key", type: "text", required: true, max: 80 },
    ...autodate(),
  ],
  indexes: [
    "CREATE UNIQUE INDEX idx_orders_number ON orders (order_number)",
    "CREATE UNIQUE INDEX idx_orders_idempotency ON orders (customer, idempotency_key)",
  ],
});

await ensure("order_items", {
  name: "order_items",
  type: "base",
  ...COLLECTION_RULES.order_items,
  fields: [
    { name: "order", type: "relation", required: true, collectionId: orders.id, cascadeDelete: true, maxSelect: 1 },
    { name: "product", type: "relation", collectionId: products.id, cascadeDelete: false, maxSelect: 1 },
    { name: "product_name_snapshot", type: "text", required: true, max: 100 },
    { name: "unit_price", type: "number", required: true, min: 0, onlyInt: true },
    { name: "quantity", type: "number", required: true, min: 1, max: 99, onlyInt: true },
    { name: "subtotal", type: "number", required: true, min: 0, onlyInt: true },
    ...autodate(),
  ],
});

await ensure("notifications", {
  name: "notifications",
  type: "base",
  ...COLLECTION_RULES.notifications,
  fields: [
    { name: "user", type: "relation", collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
    { name: "store", type: "relation", collectionId: stores.id, cascadeDelete: true, maxSelect: 1 },
    { name: "order", type: "relation", collectionId: orders.id, cascadeDelete: true, maxSelect: 1 },
    { name: "type", type: "text", required: true, min: 1, max: 50 },
    { name: "message", type: "text", required: true, max: 500 },
    { name: "is_read", type: "bool" },
    ...autodate(),
  ],
});

await ensure("reviews", {
  name: "reviews",
  type: "base",
  ...COLLECTION_RULES.reviews,
  fields: [
    { name: "customer", type: "relation", required: true, collectionId: usersId, cascadeDelete: true, maxSelect: 1 },
    { name: "store", type: "relation", required: true, collectionId: stores.id, cascadeDelete: true, maxSelect: 1 },
    { name: "order", type: "relation", required: true, collectionId: orders.id, cascadeDelete: true, maxSelect: 1 },
    { name: "rating", type: "number", required: true, min: 1, max: 5, onlyInt: true },
    { name: "comment", type: "text", max: 500 },
    { name: "hidden", type: "bool" },
    ...autodate(),
  ],
  indexes: ["CREATE UNIQUE INDEX idx_reviews_order ON reviews (order)"],
});

collections = await listCollections(url, token);
const authCollection = await getCollection(url, token, byName().oder_users.id);
if (authCollection?.fields) {
  const fields = authCollection.fields.map((field) =>
    field.name === "password" ? { ...field, min: 4 } : field
  );
  await updateCollection(url, token, authCollection.id, { fields });
  console.log("updated oder_users password min");
}

if (env.APP_ENV === "production") {
  const listed = await request(
    url,
    `/api/collections/oder_users/records?filter=${encodeURIComponent('email="admin@campus-order.test"')}&perPage=1`,
    { headers: { Authorization: token } }
  );
  const existing = listed.data.items?.[0];
  if (existing) {
    await request(url, `/api/collections/oder_users/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token },
      body: JSON.stringify({ status: "disabled" }),
    });
    console.log("disabled weak test admin for production");
  }
} else {
  await ensureRecord(url, token, "oder_users", 'email="admin@campus-order.test"', {
    email: "admin@campus-order.test",
    password: "1234",
    passwordConfirm: "1234",
    verified: true,
    display_name: "測試管理員",
    name: "測試管理員",
    role: "admin",
    status: "active",
  });
}

collections = await listCollections(url, token);
for (const [name, rules] of Object.entries(COLLECTION_RULES)) {
  const collection = byName()[name];
  if (!collection) continue;
  await updateCollection(url, token, collection.id, rules);
  console.log(`rules ${name}`);
}

const integerFields = {
  products: ["price"],
  orders: ["total"],
  order_items: ["unit_price", "subtotal"],
};
for (const [name, fieldNames] of Object.entries(integerFields)) {
  const collection = byName()[name];
  if (!collection) continue;
  const full = await getCollection(url, token, collection.id);
  const fields = (full.fields || []).map((field) =>
    fieldNames.includes(field.name) ? { ...field, onlyInt: true } : field
  );
  await updateCollection(url, token, collection.id, { fields });
  console.log(`integer ${name}`);
}

console.log("School PocketBase collections are ready.");
