/**
 * 統一 API
 * 第一階段走 mock；接 GAS 時在此改成 fetch(config.API_BASE_URL + '?action=...')
 * 店家訂單：store_id 由 auth 決定，不吃前端參數
 */
import { config } from "./config.js";
import { auth } from "./auth.js";
import { getDb, saveDb } from "./mock/db.js";
import { isPickupTimeAllowed, toTime24 } from "./format.js";
import { supabaseApi } from "./supabase-api.js";
import { normalizeServicePeriods, servicePeriodBounds } from "./service-periods.js";

function delay(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addNote(db, payload) {
  if (!Array.isArray(db.Notifications)) db.Notifications = [];
  db.Notifications.unshift({
    notification_id: newId("N"),
    read: false,
    created_at: new Date().toISOString(),
    ...payload,
  });
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

const mockApi = {
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

  async updateCustomerProfile(name, grade) {
    const n = String(name || "").trim();
    const g = String(grade || "").trim();
    if (!n) return { ok: false, code: "need_name" };
    if (!g) return { ok: false, code: "need_grade" };
    if (!["high_1", "high_2", "high_3"].includes(g)) {
      return { ok: false, code: "invalid_grade" };
    }
    const db = getDb();
    const current = auth.ensureCustomer();
    const user = db.Users.find((item) => item.user_id === current.user_id);
    if (user) {
      user.name = n;
      user.grade = g;
      saveDb(db);
    }
    return { ok: true };
  },

  async createOrder({ customer_id, customer_name, customer_grade, store_id, pickup_time, payment_method, items }) {
    await delay();
    if (!config.USE_MOCK) {
      const res = await fetch(config.API_BASE_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "createOrder",
          customer_id,
          customer_name,
          store_id,
          pickup_time,
          payment_method,
          items,
        }),
      });
      return res.json();
    }
    const name = String(customer_name || "").trim();
    const grade = String(customer_grade || "").trim();
    if (!name) return { ok: false, code: "need_name" };
    if (!grade) return { ok: false, code: "need_grade" };
    if (!["high_1", "high_2", "high_3"].includes(grade)) {
      return { ok: false, code: "invalid_grade" };
    }
    const db = getDb();
    const store = db.Stores.find((s) => s.store_id === store_id);
    if (!store) return { ok: false, code: "no_store" };
    if (store.status !== "open") return { ok: false, code: "store_closed" };
    if (!isPickupTimeAllowed(store, pickup_time)) return { ok: false, code: "invalid_pickup" };
    if (!Array.isArray(items) || !items.length) return { ok: false, code: "invalid_items" };

    const order_id = newId("ORD");
    const now = new Date().toISOString();
    let total = 0;
    const orderItems = [];
    for (const it of items) {
      const product = db.Products.find(
        (p) => p.product_id === it.product_id && p.store_id === store_id && p.status === "active"
      );
      const qty = Number(it.quantity);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return { ok: false, code: "invalid_items" };
      }
      const unit = Number(product.price);
      if (!Number.isFinite(unit) || unit < 0) return { ok: false, code: "invalid_items" };
      const subtotal = unit * qty;
      total += subtotal;
      orderItems.push({
        order_item_id: newId("OI"),
        order_id,
        product_id: it.product_id,
        product_name: product.product_name,
        unit_price: unit,
        quantity: qty,
        subtotal,
      });
    }
    const order = {
      order_id,
      store_id,
      customer_id,
      customer_name: name,
      customer_grade: grade,
      pickup_time,
      total,
      payment_method: ["cash", "campus"].includes(payment_method) ? payment_method : "cash",
      status: "pending",
      created_at: now,
      updated_at: now,
    };
    db.Orders.push(order);
    db.OrderItems.push(...orderItems);
    addNote(db, {
      role: "store",
      store_id,
      order_id,
      key: "notice_new_order",
      vars: { name, id: order_id },
    });
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
    const transitions = {
      pending: ["ready", "rejected"],
      ready: ["completed"],
    };
    if (!transitions[order.status]?.includes(nextStatus)) {
      return { ok: false, code: "invalid_status", message: "訂單狀態順序不正確" };
    }
    order.status = nextStatus;
    order.updated_at = new Date().toISOString();
    addNote(db, {
      role: "customer",
      user_id: order.customer_id,
      store_id: order.store_id,
      order_id: order.order_id,
      key: "notice_status",
      vars: { id: order.order_id, status: nextStatus },
    });
    saveDb(db);
    return { ok: true, order };
  },

  async cancelOrder(orderId) {
    await delay();
    const session = auth.getSession();
    const db = getDb();
    const order = db.Orders.find((o) => o.order_id === orderId);
    if (!order) return { ok: false, code: "no_product" };
    const done = ["completed", "cancelled", "rejected"].includes(order.status);
    if (done) return { ok: false, code: "cannot_cancel" };
    const isAdmin = session && session.role === "admin";
    const isStore = session && session.role === "store" && order.store_id === auth.getBoundStoreId();
    const isCust = session && session.role === "customer" && order.customer_id === session.user_id;
    const guest = auth.ensureCustomer();
    const isGuestCust = guest.user_id === order.customer_id && (!session || session.role === "customer");
    if (!isAdmin && !isStore && !isCust && !isGuestCust) return { ok: false, code: "cannot_cancel" };
    if (session && session.role === "customer" && !["pending", "accepted"].includes(order.status)) {
      return { ok: false, code: "cannot_cancel" };
    }
    order.status = "cancelled";
    order.updated_at = new Date().toISOString();
    if (isStore || isAdmin) {
      addNote(db, {
        role: "customer",
        user_id: order.customer_id,
        store_id: order.store_id,
        order_id: order.order_id,
        key: "notice_cancel",
        vars: { id: order.order_id },
      });
    } else {
      addNote(db, {
        role: "store",
        store_id: order.store_id,
        order_id: order.order_id,
        key: "notice_cancel",
        vars: { id: order.order_id, name: order.customer_name || "" },
      });
    }
    saveDb(db);
    return { ok: true, order };
  },

  async getNotifications() {
    await delay();
    const session = auth.getSession();
    const db = getDb();
    const notes = db.Notifications || [];
    if (!session) return [];
    if (session.role === "admin") return notes.filter((n) => n.role === "admin");
    if (session.role === "store") {
      const sid = auth.getBoundStoreId();
      return notes.filter((n) => n.role === "store" && n.store_id === sid);
    }
    return notes.filter((n) => n.role === "customer" && n.user_id === session.user_id);
  },

  async markNotificationRead(id) {
    await delay();
    const db = getDb();
    const n = (db.Notifications || []).find((x) => x.notification_id === id);
    if (n) n.read = true;
    saveDb(db);
    return { ok: true };
  },

  async requestPasswordReset(username) {
    await delay();
    const db = getDb();
    const acc = db.Accounts.find((a) => a.username === String(username || "").trim());
    if (!acc) return { ok: false, code: "forgot_unknown" };
    const user = db.Users.find((u) => u.user_id === acc.user_id);
    if (!user || user.role !== "store") return { ok: false, code: "forgot_unknown" };
    if (!Array.isArray(db.PasswordResets)) db.PasswordResets = [];
    db.PasswordResets.unshift({
      reset_id: newId("PW"),
      username: acc.username,
      user_id: user.user_id,
      store_id: user.store_id,
      done: false,
      created_at: new Date().toISOString(),
    });
    addNote(db, {
      role: "admin",
      key: "notice_reset",
      vars: { user: acc.username, id: user.store_id },
    });
    saveDb(db);
    return { ok: true };
  },

  async resetStorePassword(storeId, newPassword) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const pwd = String(newPassword || "");
    if (pwd.length < 4) return { ok: false, code: "password_too_short" };
    const db = getDb();
    const user = db.Users.find((u) => u.role === "store" && u.store_id === storeId);
    if (!user) return { ok: false, code: "no_store" };
    const acc = db.Accounts.find((a) => a.user_id === user.user_id);
    if (!acc) return { ok: false, code: "no_store" };
    acc.password = pwd;
    (db.PasswordResets || []).forEach((r) => {
      if (r.store_id === storeId) r.done = true;
    });
    addNote(db, {
      role: "store",
      store_id: storeId,
      key: "pw_reset_ok",
      vars: {},
    });
    saveDb(db);
    return { ok: true, username: acc.username };
  },

  async getPasswordResets() {
    await delay();
    if (!requireAdmin()) return [];
    return (getDb().PasswordResets || []).filter((r) => !r.done);
  },

  async getAdminOrders() {
    await delay();
    if (!requireAdmin()) return [];
    const db = getDb();
    return db.Orders.slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((o) => ({
        ...o,
        items: db.OrderItems.filter((i) => i.order_id === o.order_id),
      }));
  },

  async createStore(payload) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const db = getDb();
    const username = String(payload.username || "").trim();
    if (!username || String(payload.password || "").length < 4) {
      return { ok: false, code: "password_too_short" };
    }
    if (db.Accounts.some((a) => a.username === username)) {
      return { ok: false, code: "username_taken" };
    }
    const store_id = nextStoreId(db);
    const now = new Date().toISOString();
    const service_periods = normalizeServicePeriods(payload.service_periods);
    if (!service_periods.length) return { ok: false, code: "need_service_period" };
    const bounds = servicePeriodBounds(service_periods);
    const store = {
      store_id,
      store_name: String(payload.store_name || "").trim(),
      description: String(payload.description || "").trim(),
      open_time: bounds.open_time,
      close_time: bounds.close_time,
      service_periods,
      status: payload.status === "closed" ? "closed" : "open",
      image: String(payload.image || "🏪").trim() || "🏪",
    };
    if (!store.store_name) return { ok: false, code: "need_store_name" };
    const user_id = newId("user");
    db.Stores.push(store);
    db.Users.push({
      user_id,
      name: store.store_name,
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
    if (patch.store_name != null) {
      const name = String(patch.store_name).trim();
      if (!name) return { ok: false, code: "need_store_name" };
      store.store_name = name;
    }
    if (patch.description != null) store.description = String(patch.description).trim();
    if (patch.service_periods != null) {
      const periods = normalizeServicePeriods(patch.service_periods);
      if (!periods.length) return { ok: false, code: "need_service_period" };
      const bounds = servicePeriodBounds(periods);
      store.service_periods = periods;
      store.open_time = bounds.open_time;
      store.close_time = bounds.close_time;
    }
    if (patch.open_time != null) store.open_time = toTime24(patch.open_time, store.open_time);
    if (patch.close_time != null) store.close_time = toTime24(patch.close_time, store.close_time);
    if (patch.image != null) store.image = String(patch.image).trim() || store.image;
    if (patch.status === "open" || patch.status === "closed") store.status = patch.status;
    saveDb(db);
    return { ok: true, store };
  },

  async deleteStore(storeId) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const db = getDb();
    if (!db.Stores.some((s) => s.store_id === storeId)) return { ok: false, code: "no_store" };
    const userIds = new Set(db.Users.filter((u) => u.store_id === storeId).map((u) => u.user_id));
    db.Stores = db.Stores.filter((s) => s.store_id !== storeId);
    db.Products = db.Products.filter((p) => p.store_id !== storeId);
    db.Users = db.Users.filter((u) => u.store_id !== storeId);
    db.Accounts = db.Accounts.filter((a) => !userIds.has(a.user_id));
    if (Array.isArray(db.PasswordResets)) {
      db.PasswordResets = db.PasswordResets.filter((r) => r.store_id !== storeId);
    }
    saveDb(db);
    return { ok: true };
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
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) return { ok: false, code: "invalid_price" };
    const product = {
      product_id: newId("P"),
      store_id,
      category: String(payload.category || "").trim() || "—",
      product_name,
      description: String(payload.description || "").trim(),
      price,
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
    if (!session) return { ok: false, code: "bad_login" };
    const db = getDb();
    const product = db.Products.find((p) => p.product_id === productId);
    if (!product) return { ok: false, code: "no_product" };
    if (session.role === "store") {
      if (product.store_id !== auth.getBoundStoreId()) return { ok: false, code: "not_admin" };
    } else if (session.role !== "admin") {
      return { ok: false, code: "not_admin" };
    }
    if (patch.product_name != null) {
      const name = String(patch.product_name).trim();
      if (!name) return { ok: false, code: "need_product_name" };
      product.product_name = name;
    }
    if (patch.category != null) product.category = String(patch.category).trim();
    if (patch.description != null) product.description = String(patch.description).trim();
    if (patch.price != null) {
      const price = Number(patch.price);
      if (!Number.isFinite(price) || price < 0) return { ok: false, code: "invalid_price" };
      product.price = price;
    }
    if (patch.image != null) product.image = String(patch.image).trim() || product.image;
    if (patch.status === "active" || patch.status === "soldout") product.status = patch.status;
    saveDb(db);
    return { ok: true, product };
  },

  async deleteProduct(productId) {
    await delay();
    const session = auth.getSession();
    if (!session) return { ok: false, code: "bad_login" };
    const db = getDb();
    const product = db.Products.find((p) => p.product_id === productId);
    if (!product) return { ok: false, code: "no_product" };
    if (session.role === "store") {
      if (product.store_id !== auth.getBoundStoreId()) return { ok: false, code: "not_admin" };
    } else if (session.role !== "admin") {
      return { ok: false, code: "not_admin" };
    }
    db.Products = db.Products.filter((p) => p.product_id !== productId);
    saveDb(db);
    return { ok: true };
  },

  async getAdminUsers() {
    await delay();
    if (!requireAdmin()) return [];
    return getDb().Users.slice();
  },

  async deleteUserAccount(userId) {
    await delay();
    if (!requireAdmin()) return { ok: false, code: "not_admin" };
    const db = getDb();
    const user = db.Users.find((item) => item.user_id === userId);
    if (!user) return { ok: false, code: "no_user" };
    if (user.role === "admin") return { ok: false, code: "cannot_delete_admin" };
    db.Accounts = db.Accounts.filter((account) => account.user_id !== userId);
    db.Users = db.Users.filter((item) => item.user_id !== userId);
    db.Notifications = (db.Notifications || []).filter((note) => note.user_id !== userId);
    db.PasswordResets = (db.PasswordResets || []).filter((reset) => reset.user_id !== userId);
    saveDb(db);
    return { ok: true, user_id: userId, role: user.role, store_id: user.store_id || "" };
  },

  async getAdminReviews() {
    await delay();
    if (!requireAdmin()) return [];
    return getDb().Reviews.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getAdminStats() {
    await delay();
    if (!requireAdmin()) return null;
    const db = getDb();
    const today = new Date().toDateString();
    const todayOrders = db.Orders.filter((o) => new Date(o.created_at).toDateString() === today);
    const revenue = db.Orders.filter((o) => o.status !== "rejected" && o.status !== "cancelled").reduce(
      (s, o) => s + Number(o.total || 0),
      0
    );
    const storeHits = {};
    db.Orders.forEach((o) => {
      storeHits[o.store_id] = (storeHits[o.store_id] || 0) + 1;
    });
    const productHits = {};
    db.OrderItems.forEach((i) => {
      productHits[i.product_name] = (productHits[i.product_name] || 0) + i.quantity;
    });
    const hourHits = {};
    db.Orders.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      hourHits[h] = (hourHits[h] || 0) + 1;
    });
    const topStore = Object.entries(storeHits).sort((a, b) => b[1] - a[1])[0];
    const topProduct = Object.entries(productHits).sort((a, b) => b[1] - a[1])[0];
    const peakHour = Object.entries(hourHits).sort((a, b) => b[1] - a[1])[0];
    return {
      stores: db.Stores.length,
      products: db.Products.length,
      orders: db.Orders.length,
      today: todayOrders.length,
      revenue,
      topStoreId: topStore ? topStore[0] : "",
      topStoreN: topStore ? topStore[1] : 0,
      topProduct: topProduct ? topProduct[0] : "",
      peakHour: peakHour ? Number(peakHour[0]) : null,
    };
  },
};

export const api = config.USE_MOCK ? mockApi : supabaseApi;
