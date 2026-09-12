import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const QUERY_INDEXES = {
  orders: [
    "CREATE INDEX idx_orders_customer_created ON orders (customer, created)",
    "CREATE INDEX idx_orders_store_created ON orders (store, created)",
  ],
  order_items: ['CREATE INDEX idx_order_items_order ON order_items ("order")'],
  notifications: [
    "CREATE INDEX idx_notifications_user_created ON notifications (user, created)",
    "CREATE INDEX idx_notifications_store_created ON notifications (store, created)",
  ],
};

const env = await loadEnv();
const url = (env.POCKETBASE_URL || "").replace(/\/$/, "");
const email = env.POCKETBASE_ADMIN_EMAIL || "";
const password = env.POCKETBASE_ADMIN_PASSWORD || "";
if (!url || !email || !password) {
  console.log("skip: PocketBase superuser env is not set");
  process.exit(0);
}

const auth = await request(url, "/api/collections/_superusers/auth-with-password", {
  method: "POST",
  body: JSON.stringify({ identity: email, password }),
});
if (!auth.ok || !auth.data.token) {
  console.log("skip: could not sign in as PocketBase superuser");
  process.exit(0);
}
const token = auth.data.token;
const listed = await request(url, "/api/collections?perPage=200", {
  headers: { Authorization: token },
});
if (!listed.ok) throw new Error("could not list collections");
const byName = Object.fromEntries((listed.data.items || []).map((item) => [item.name, item]));

for (const [name, wanted] of Object.entries(QUERY_INDEXES)) {
  const collection = byName[name];
  if (!collection) {
    console.log(`missing ${name}`);
    continue;
  }
  const full = await request(url, `/api/collections/${collection.id}`, {
    headers: { Authorization: token },
  });
  if (!full.ok) throw new Error(`could not read ${name}`);
  const indexes = Array.isArray(full.data.indexes) ? full.data.indexes.slice() : [];
  let changed = false;
  for (const sql of wanted) {
    const indexName = sql.match(/INDEX\s+(\S+)/i)?.[1];
    if (indexName && indexes.some((item) => String(item).includes(indexName))) continue;
    indexes.push(sql);
    changed = true;
  }
  if (!changed) {
    console.log(`indexes ${name} already present`);
    continue;
  }
  const updated = await request(url, `/api/collections/${collection.id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: JSON.stringify({ indexes }),
  });
  if (!updated.ok) {
    console.log(`indexes ${name} failed`);
    continue;
  }
  console.log(`indexes ${name} updated`);
}
