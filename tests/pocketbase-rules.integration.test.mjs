import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  try {
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
  } catch {
    return {};
  }
}

const env = await loadEnv();
const url = (env.POCKETBASE_URL || process.env.POCKETBASE_URL || "").replace(/\/$/, "");
const email = env.POCKETBASE_ADMIN_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL || "";
const password = env.POCKETBASE_ADMIN_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD || "";
const integration = url && email && password ? test : test.skip;
if (url) process.env.POCKETBASE_URL = url;
if (email) process.env.POCKETBASE_ADMIN_EMAIL = email;
if (password) process.env.POCKETBASE_ADMIN_PASSWORD = password;

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

async function superuser() {
  const result = await request("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password }),
  });
  assert.equal(result.ok, true, "superuser login");
  return result.data.token;
}

integration("unauthenticated writes are rejected", async () => {
  const product = await request("/api/collections/products/records", {
    method: "POST",
    body: JSON.stringify({ name: "blocked", category: "其他", price: 1, status: "active" }),
  });
  assert.equal(product.ok, false);
  const order = await request("/api/collections/orders/records", {
    method: "POST",
    body: JSON.stringify({ order_number: "x", total: 1, status: "pending" }),
  });
  assert.equal(order.ok, false);
  const deleted = await request("/api/collections/stores/records/nope", { method: "DELETE" });
  assert.equal(deleted.ok, false);
});

integration("customer cannot escalate role, bind a store, or rewrite order totals", async () => {
  const token = await superuser();
  const guestEmail = `rulecheck_${Date.now()}@campus-order.test`;
  const created = await request("/api/collections/oder_users/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      email: guestEmail,
      password: "testpass1",
      passwordConfirm: "testpass1",
      verified: true,
      role: "customer",
      status: "active",
      display_name: "規則測試",
    }),
  });
  assert.equal(created.ok, true, JSON.stringify(created.data));
  const auth = await request("/api/collections/oder_users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: guestEmail, password: "testpass1" }),
  });
  assert.equal(auth.ok, true);
  const userToken = auth.data.token;
  const userId = auth.data.record.id;

  const role = await request(`/api/collections/oder_users/records/${userId}`, {
    method: "PATCH",
    headers: { Authorization: userToken },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(role.ok, false);

  const storeBind = await request(`/api/collections/oder_users/records/${userId}`, {
    method: "PATCH",
    headers: { Authorization: userToken },
    body: JSON.stringify({ store: "store0000000001" }),
  });
  assert.equal(storeBind.ok, false);

  const orders = await request("/api/collections/orders/records?perPage=1", {
    headers: { Authorization: userToken },
  });
  const foreign = (orders.data.items || [])[0];
  if (foreign) {
    const total = await request(`/api/collections/orders/records/${foreign.id}`, {
      method: "PATCH",
      headers: { Authorization: userToken },
      body: JSON.stringify({ total: 1 }),
    });
    assert.equal(total.ok, false);
  }

  await request(`/api/collections/oder_users/records/${userId}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
});

integration("trusted guest-login issues an oder_users token", async () => {
  const { handleAppAction } = await import("../server/app-handlers.js");
  const guest = await handleAppAction("guest-login", {});
  assert.equal(Boolean(guest.token && guest.record?.id), true);
  assert.equal(guest.record.role, "customer");
  const stores = await request("/api/collections/stores/records?perPage=1", {
    headers: { Authorization: guest.token },
  });
  assert.equal(stores.ok, true);
  const token = await superuser();
  await request(`/api/collections/oder_users/records/${guest.record.id}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
});

integration("store A cannot read or change store B data", async () => {
  const token = await superuser();
  const suffix = `${Date.now()}`;
  const storeA = await request("/api/collections/stores/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      name: `隔離A${suffix}`,
      description: "a",
      image_url: "🏪",
      open_time: "08:35",
      close_time: "18:25",
      status: "open",
    }),
  });
  const storeB = await request("/api/collections/stores/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      name: `隔離B${suffix}`,
      description: "b",
      image_url: "🏪",
      open_time: "08:35",
      close_time: "18:25",
      status: "open",
    }),
  });
  assert.equal(storeA.ok && storeB.ok, true, JSON.stringify({ storeA: storeA.data, storeB: storeB.data }));
  const userA = await request("/api/collections/oder_users/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      email: `store_a_${suffix}@campus-order.test`,
      password: "testpass1",
      passwordConfirm: "testpass1",
      verified: true,
      role: "store",
      status: "active",
      store: storeA.data.id,
      display_name: "店A",
    }),
  });
  const productB = await request("/api/collections/products/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      store: storeB.data.id,
      name: "B餐",
      category: "其他",
      price: 30,
      status: "active",
    }),
  });
  const customer = await request("/api/collections/oder_users/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      email: `cust_${suffix}@campus-order.test`,
      password: "testpass1",
      passwordConfirm: "testpass1",
      verified: true,
      role: "customer",
      status: "active",
      display_name: "顧客",
    }),
  });
  const orderB = await request("/api/collections/orders/records", {
    method: "POST",
    headers: { Authorization: token },
    body: JSON.stringify({
      order_number: `ORD-TEST-${suffix}`,
      customer: customer.data.id,
      customer_name: "顧客",
      store: storeB.data.id,
      pickup_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      payment_method: "cash",
      total: 30,
      status: "pending",
      idempotency_key: `iso-${suffix}`,
    }),
  });
  const authA = await request("/api/collections/oder_users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: `store_a_${suffix}@campus-order.test`, password: "testpass1" }),
  });
  try {
    assert.equal(userA.ok && productB.ok && customer.ok && orderB.ok && authA.ok, true);
    const stealProduct = await request(`/api/collections/products/records/${productB.data.id}`, {
      method: "PATCH",
      headers: { Authorization: authA.data.token },
      body: JSON.stringify({ name: "被改", store: storeA.data.id }),
    });
    assert.equal(stealProduct.ok, false);
    const stealOrder = await request(`/api/collections/orders/records/${orderB.data.id}`, {
      method: "PATCH",
      headers: { Authorization: authA.data.token },
      body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(stealOrder.ok, false);
    const listed = await request("/api/collections/orders/records?perPage=50", {
      headers: { Authorization: authA.data.token },
    });
    assert.equal((listed.data.items || []).some((row) => row.id === orderB.data.id), false);
  } finally {
    if (orderB.data?.id) {
      await request(`/api/collections/orders/records/${orderB.data.id}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });
    }
    if (productB.data?.id) {
      await request(`/api/collections/products/records/${productB.data.id}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });
    }
    for (const id of [userA.data?.id, customer.data?.id]) {
      if (id) {
        await request(`/api/collections/oder_users/records/${id}`, {
          method: "DELETE",
          headers: { Authorization: token },
        });
      }
    }
    for (const id of [storeA.data?.id, storeB.data?.id]) {
      if (id) {
        await request(`/api/collections/stores/records/${id}`, {
          method: "DELETE",
          headers: { Authorization: token },
        });
      }
    }
  }
});

