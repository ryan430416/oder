/**
 * 統一 API
 * 第一階段走 mock；接 GAS 時在此改成 fetch(config.API_BASE_URL + '?action=...')
 * 店家訂單：store_id 由 auth 決定，不吃前端參數
 */
import { config } from "./config.js";
import { auth } from "./auth.js";
import { getDb, saveDb } from "./mock/db.js";

function delay(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function requireAdmin() {
  const s = auth.getSession();
  return s && s.role === "admin";
}

function nextStoreId(db) {
  const nums = db.Stores.map((s) => parseInt(String(s.store_id).replace(/\D/g, ""), 10)).filter(
    (n) => !Number.isNaN(n)
  );
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "S" + String(next).padStart(3, "0");
}

export const api = {
  async getStores() {
    await delay();
    if (!config.USE_MOCK) {
      const res = await fetch(`${config.API_BASE_URL}?action=stores`);
      return res.json();
    }
    return getDb().Stores.slice();
  },

  async getStore(storeId) {
    const stores = await this.getStores();
    return stores.find((s) => s.store_id === storeId) || null;
  },

  async getProducts(storeId) {
    await delay();
    if (!config.USE_MOCK) {
      const res = await fetch(
        `${config.API_BASE_URL}?action=products&store_id=${encodeURIComponent(storeId)}`
      );
      return res.json();
    }
    return getDb().Products.filter((p) => p.store_id === storeId);
  },

  async createOrder({ customer_id, store_id, pickup_time, payment_method, items }) {
    await delay();
    if (!config.USE_MOCK) {
      const res = await fetch(config.API_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "createOrder",
          customer_id,
          store_id,
          pickup_time,
          payment_method,
          items,
        }),
      });
      return res.json();
    }
    const db = getDb();
    const order_id = newId("ORD");
    const now = new Date().toISOString();
    let total = 0;
    const orderItems = items.map((it) => {
      const product = db.Products.find((p) => p.product_id === it.product_id);
      const unit = product ? product.price : it.unit_price;
      const qty = Number(it.quantity);
      const subtotal = unit * qty;
      total += subtotal;
      return {
        order_item_id: newId("OI"),
        order_id,
        product_id: it.product_id,
        product_name: product ? product.product_name : it.product_name,
        unit_price: unit,
        quantity: qty,
        subtotal,
      };
    });
    const order = {
      order_id,
      store_id,
      customer_id,
      pickup_time,
      total,
      payment_method,
      status: "pending",
      created_at: now,
      updated_at: now,
    };
    db.Orders.push(order);
    db.OrderItems.push(...orderItems);
    saveDb(db);
    return { ok: true, order, items: orderItems };
  },

  async getCustomerOrders(customerId) {
    await delay();
    const db = getDb();
    const orders = db.Orders.filter((o) => o.customer_id === customerId).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return orders.map((o) => ({
      ...o,
      items: db.OrderItems.filter((i) => i.order_id === o.order_id),
    }));
  },

  /**
   * 店家訂單：忽略任何前端傳入的 store_id
   */
  async getStoreOrders() {
    await delay();
    const storeId = auth.getBoundStoreId();
    if (!storeId) return [];
    const db = getDb();
    const orders = db.Orders.filter((o) => o.store_id === storeId).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return orders.map((o) => ({
      ...o,
      items: db.OrderItems.filter((i) => i.order_id === o.order_id),
    }));
  },

  async updateOrderStatus(orderId, nextStatus) {
    await delay();
    const storeId = auth.getBoundStoreId();
    const db = getDb();
    const order = db.Orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, message: "找不到訂單" };
    if (order.store_id !== storeId) {
      return { ok: false, message: "無權限操作此訂單" };
    }
    order.status = nextStatus;
    order.updated_at = new Date().toISOString();
    saveDb(db);
    return { ok: true, order };
  },

  async getAdminOrders() {
    await delay();
    const session = auth.getSession();
    if (!session || session.role !== "admin") return [];
    const db = getDb();
    return db.Orders.slice();
  },

  async createStore(payload) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const db = getDb();
    const username = String(payload.username || "").trim();
    if (!username || !payload.password) return { ok: false, code: "bad_login" };
    if (db.Accounts.some((a) => a.username === username)) {
      return { ok: false, code: "username_taken" };
    }
    const store_id = nextStoreId(db);
    const now = new Date().toISOString();
    const store = {
      store_id,
      store_name: String(payload.store_name || "").trim(),
      description: String(payload.description || "").trim(),
      open_time: payload.open_time || "10:00",
      close_time: payload.close_time || "20:00",
      status: payload.status === "closed" ? "closed" : "open",
      image: String(payload.image || "🏪").trim() || "🏪",
    };
    if (!store.store_name) return { ok: false, code: "need_store_name" };
    const user_id = newId("user");
    db.Stores.push(store);
    db.Users.push({
      user_id,
      name: String(payload.staff_name || store.store_name).trim(),
      role: "store",
      store_id,
      status: "active",
      created_at: now,
    });
    db.Accounts.push({ username, password: String(payload.password), user_id });
    saveDb(db);
    return { ok: true, store, username };
  },

  async updateStore(storeId, patch) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const db = getDb();
    const store = db.Stores.find((s) => s.store_id === storeId);
    if (!store) return { ok: false, code: "no_store" };
    if (patch.store_name != null) store.store_name = String(patch.store_name).trim();
    if (patch.description != null) store.description = String(patch.description).trim();
    if (patch.open_time != null) store.open_time = patch.open_time;
    if (patch.close_time != null) store.close_time = patch.close_time;
    if (patch.image != null) store.image = String(patch.image).trim() || store.image;
    if (patch.status === "open" || patch.status === "closed") store.status = patch.status;
    saveDb(db);
    return { ok: true, store };
  },

  async createProduct(payload) {
    await delay();
    const session = auth.getSession();
    if (!session) return { ok: false, code: "bad_login" };
    let store_id = payload.store_id;
    if (session.role === "store") store_id = auth.getBoundStoreId();
    else if (session.role !== "admin") return { ok: false, code: "not_admin" };
    if (!store_id) return { ok: false, code: "no_store" };
    const db = getDb();
    if (!db.Stores.some((s) => s.store_id === store_id)) return { ok: false, code: "no_store" };
    const product_name = String(payload.product_name || "").trim();
    if (!product_name) return { ok: false, code: "need_product_name" };
    const product = {
      product_id: newId("P"),
      store_id,
      category: String(payload.category || "").trim() || "—",
      product_name,
      description: String(payload.description || "").trim(),
      price: Number(payload.price) || 0,
      image: String(payload.image || "🍽️").trim() || "🍽️",
      status: payload.status === "soldout" ? "soldout" : "active",
    };
    db.Products.push(product);
    saveDb(db);
    return { ok: true, product };
  },

  async updateProduct(productId, patch) {
    await delay();
    const session = auth.getSession();
    const db = getDb();
    const product = db.Products.find((p) => p.product_id === productId);
    if (!product) return { ok: false, code: "no_product" };
    if (session.role === "store") {
      if (product.store_id !== auth.getBoundStoreId()) return { ok: false, code: "not_admin" };
    } else if (session.role !== "admin") {
      return { ok: false, code: "not_admin" };
    }
    if (patch.product_name != null) product.product_name = String(patch.product_name).trim();
    if (patch.category != null) product.category = String(patch.category).trim();
    if (patch.description != null) product.description = String(patch.description).trim();
    if (patch.price != null) product.price = Number(patch.price) || 0;
    if (patch.image != null) product.image = String(patch.image).trim() || product.image;
    if (patch.status === "active" || patch.status === "soldout") product.status = patch.status;
    saveDb(db);
    return { ok: true, product };
  },
};

