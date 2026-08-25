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
};
