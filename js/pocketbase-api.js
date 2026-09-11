import { AUTH_COLLECTION } from "./collections.js";
import { auth } from "./auth.js";
import { appSend, getPocketBase } from "./pocketbase.js";
import { LEGACY_STORE_SERVICE_PERIODS, normalizeServicePeriods, servicePeriodBounds } from "./service-periods.js";
import { normalizeStoreImage } from "./store-image.js";

function fileName(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function normalizeStore(row) {
  if (!row) return null;
  return {
    ...row,
    store_id: row.id,
    store_name: row.name,
    image: row.image_url || "",
    open_time: String(row.open_time || "").slice(0, 5),
    close_time: String(row.close_time || "").slice(0, 5),
    service_periods: normalizeServicePeriods(row.service_periods),
    created_at: row.created_at || row.created,
    updated_at: row.updated_at || row.updated,
  };
}

function normalizeProduct(row, runtimeUrl = "", fullUrl = "") {
  if (!row) return null;
  const imagePath = fileName(row.image);
  const display = runtimeUrl || row.image_url || "";
  const full = fullUrl || display;
  return {
    ...row,
    product_id: row.id,
    product_name: row.name,
    store_id: row.store || row.store_id || "",
    image_path: imagePath,
    image: display,
    image_full: full,
    created_at: row.created_at || row.created,
    updated_at: row.updated_at || row.updated,
  };
}

function normalizeOrder(row) {
  if (!row) return null;
  return {
    ...row,
    order_id: row.id,
    store_id: row.store || row.store_id || "",
    customer_id: row.customer || row.customer_id || "",
    created_at: row.created_at || row.created,
    updated_at: row.updated_at || row.updated,
    items: (row.items || []).map((item) => ({
      ...item,
      order_item_id: item.id,
      product_id: item.product || item.product_id || "",
      product_name: item.product_name_snapshot,
    })),
  };
}

function queryFailure(error, fallback = []) {
  if (error) console.error("PocketBase query failed", error);
  return fallback;
}

function productFileUrl(client, row, filename, thumb = "") {
  if (!filename) return "";
  const getter = client.files.getURL || client.files.getUrl;
  if (!getter) return "";
  if (thumb) return getter.call(client.files, row, filename, { thumb });
  return getter.call(client.files, row, filename);
}

function withProductUrls(client, rows) {
  return (rows || []).map((row) => {
    const filename = fileName(row.image);
    const full = productFileUrl(client, row, filename);
    const thumb = productFileUrl(client, row, filename, "400x400") || full;
    return normalizeProduct(row, thumb, full);
  });
}

async function orderQuery(column, value) {
  const client = await getPocketBase();
  const filter = column && value ? client.filter(`${column} = {:value}`, { value }) : "";
  const orders = await client.collection("orders").getFullList({ filter, sort: "-created" });
  if (!orders.length) return [];
  const itemsFilter = orders.map((order) => `order = "${order.id}"`).join(" || ");
  const items = await client.collection("order_items").getFullList({ filter: itemsFilter });
  const byOrder = new Map();
  items.forEach((item) => {
    const list = byOrder.get(item.order) || [];
    list.push(item);
    byOrder.set(item.order, list);
  });
  return orders.map((order) => normalizeOrder({ ...order, items: byOrder.get(order.id) || [] }));
}

export const pocketbaseApi = {
  async getStores() {
    try {
      const client = await getPocketBase();
      const data = await client.collection("stores").getFullList({ sort: "created" });
      return { ok: true, data: data.map(normalizeStore) };
    } catch (error) {
      console.error("PocketBase query failed", error);
      return { ok: false, data: [], code: "backend_error" };
    }
  },

  async getStore(storeId) {
    try {
      const client = await getPocketBase();
      const data = await client.collection("stores").getOne(storeId);
      return { ok: true, data: normalizeStore(data) };
    } catch (error) {
      console.error("PocketBase query failed", error);
      return { ok: false, data: null, code: "backend_error" };
    }
  },

  async getProducts(storeId) {
    try {
      const client = await getPocketBase();
      const data = await client.collection("products").getFullList({
        filter: client.filter("store = {:id}", { id: storeId }),
        sort: "created",
      });
      return { ok: true, data: withProductUrls(client, data) };
    } catch (error) {
      console.error("PocketBase query failed", error);
      return { ok: false, data: [], code: "backend_error" };
    }
  },

  async updateCustomerProfile(name, grade) {
    return auth.setCustomerProfile(name, grade);
  },

  async createOrder({ customer_name, store_id, pickup_time, payment_method, items, idempotency_key }) {
    return appSend("/api/app/create-order", {
      store_id,
      customer_name,
      pickup_time,
      payment_method,
      items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
      idempotency_key: idempotency_key || crypto.randomUUID(),
    });
  },

  async getCustomerOrders() {
    const current = auth.getSession();
    return current ? orderQuery("customer", current.user_id) : [];
  },

  async getStoreOrders() {
    const storeId = auth.getBoundStoreId();
    return storeId ? orderQuery("store", storeId) : [];
  },

  updateOrderStatus(orderId, nextStatus) {
    return appSend("/api/app/update-order-status", {
      order_id: orderId,
      next_status: nextStatus,
    });
  },

  cancelOrder(orderId) {
    return appSend("/api/app/cancel-order", { order_id: orderId });
  },

  async getNotifications() {
    try {
      const client = await getPocketBase();
      const data = await client.collection("notifications").getFullList({
        sort: "-created",
      });
      return data.slice(0, 100).map((item) => ({
        ...item,
        notification_id: item.id,
        key: item.type,
        read: item.is_read,
        created_at: item.created_at || item.created,
        vars: { message: item.message },
      }));
    } catch (error) {
      return queryFailure(error);
    }
  },

  async markNotificationRead(id) {
    return appSend("/api/app/mark-notification-read", { notification_id: id });
  },

  async requestPasswordReset(username) {
    return appSend("/api/app/request-password-reset", { username });
  },

  async resetStorePassword(storeId, newPassword) {
    return appSend("/api/app/reset-store-password", {
      store_id: storeId,
      password: newPassword,
    });
  },

  async getPasswordResets() {
    return [];
  },

  getAdminOrders() {
    return orderQuery();
  },

  async createStoreAccount(storeId, username, password, displayName) {
    return appSend("/api/app/create-store-account", {
      store_id: storeId,
      username,
      password,
      display_name: displayName,
    });
  },

  async createStore(payload) {
    const client = await getPocketBase();
    const periods = LEGACY_STORE_SERVICE_PERIODS;
    const bounds = servicePeriodBounds(periods);
    try {
      const data = await client.collection("stores").create({
        name: String(payload.store_name || "").trim(),
        description: String(payload.description || "").trim(),
        image_url: normalizeStoreImage(payload.image),
        open_time: bounds.open_time,
        close_time: bounds.close_time,
        service_periods: periods,
        status: "open",
      });
      const account = await this.createStoreAccount(data.id, payload.username, payload.password, data.name);
      if (!account.ok) {
        await client.collection("stores").delete(data.id);
        return account;
      }
      return { ok: true, store: normalizeStore(data), username: payload.username };
    } catch (error) {
      return { ok: false, code: "backend_error", message: error?.message };
    }
  },

  async updateStore(storeId, patch) {
    const values = {};
    if (patch.store_name != null) values.name = String(patch.store_name).trim();
    if (patch.description != null) values.description = String(patch.description).trim();
    if (patch.status != null) values.status = patch.status;
    if (patch.image !== undefined) values.image_url = normalizeStoreImage(patch.image);
    const client = await getPocketBase();
    try {
      const data = await client.collection("stores").update(storeId, values);
      if (patch.status === "disabled" || patch.status === "open") {
        const users = await client.collection(AUTH_COLLECTION).getFullList({
          filter: client.filter("store = {:id} && role = 'store'", { id: storeId }),
        });
        await Promise.all(
          users.map((user) =>
            client.collection(AUTH_COLLECTION).update(user.id, {
              status: patch.status === "disabled" ? "disabled" : "active",
            })
          )
        );
      }
      return { ok: true, store: normalizeStore(data) };
    } catch (error) {
      return { ok: false, code: "backend_error", message: error?.message };
    }
  },

  deleteStore(storeId) {
    return appSend("/api/app/delete-store", { store_id: storeId });
  },

  async getStoreImpact(storeId) {
    const client = await getPocketBase();
    const filter = client.filter("store = {:id}", { id: storeId });
    const [products, orders, users] = await Promise.all([
      client.collection("products").getList(1, 1, { filter }),
      client.collection("orders").getList(1, 1, { filter }),
      client.collection(AUTH_COLLECTION).getList(1, 1, { filter }),
    ]);
    return {
      products: products.totalItems || 0,
      orders: orders.totalItems || 0,
      users: users.totalItems || 0,
    };
  },

  async createProduct(payload) {
    const client = await getPocketBase();
    const storeId = payload.store_id || auth.getBoundStoreId();
    if (!storeId) return { ok: false, code: "store_unbound" };
    try {
      const data = await client.collection("products").create({
        store: storeId,
        name: String(payload.product_name || "").trim(),
        category: String(payload.category || "").trim(),
        description: String(payload.description || "").trim(),
        price: Math.round(Number(payload.price)),
        status: payload.status || "active",
      });
      return { ok: true, product: normalizeProduct(data) };
    } catch (error) {
      return { ok: false, code: "backend_error", message: error?.message };
    }
  },

  async updateProduct(productId, patch) {
    const values = {};
    if (patch.product_name != null) values.name = String(patch.product_name).trim();
    if (patch.category != null) values.category = String(patch.category).trim();
    if (patch.description != null) values.description = String(patch.description).trim();
    if (patch.price != null) values.price = Math.round(Number(patch.price));
    if (patch.status != null) values.status = patch.status;
    if (patch.image === null) values.image = null;
    const client = await getPocketBase();
    try {
      const data = await client.collection("products").update(productId, values);
      return { ok: true, product: normalizeProduct(data) };
    } catch (error) {
      return { ok: false, code: "backend_error", message: error?.message };
    }
  },

  deleteProduct(productId) {
    return appSend("/api/app/delete-product", { product_id: productId });
  },

  async getAdminUsers() {
    try {
      const client = await getPocketBase();
      const data = await client.collection(AUTH_COLLECTION).getFullList({ sort: "created" });
      return data.map((row) => ({
        ...row,
        user_id: row.id,
        name: row.display_name || row.name || "",
        store_id: row.store || "",
        created_at: row.created_at || row.created,
      }));
    } catch (error) {
      return queryFailure(error);
    }
  },

  deleteUserAccount(userId) {
    return appSend("/api/app/disable-user", { user_id: userId });
  },

  async setUserStatus(userId, status) {
    try {
      const client = await getPocketBase();
      await client.collection(AUTH_COLLECTION).update(userId, { status });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: "backend_error" };
    }
  },

  async getAdminReviews() {
    try {
      const client = await getPocketBase();
      const data = await client.collection("reviews").getFullList({ sort: "-created" });
      return data.map((row) => ({
        ...row,
        customer_id: row.customer,
        store_id: row.store,
        order_id: row.order,
        created_at: row.created_at || row.created,
      }));
    } catch (error) {
      return queryFailure(error);
    }
  },

  async getAdminStats() {
    try {
      const client = await getPocketBase();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = today.toISOString().replace("T", " ");
      const [stores, products, orders] = await Promise.all([
        client.collection("stores").getList(1, 1),
        client.collection("products").getList(1, 1),
        client.collection("orders").getFullList({
          filter: `created >= "${start}"`,
        }),
      ]);
      const rows = await Promise.all(
        (orders || []).map(async (order) => {
          const items = await client.collection("order_items").getFullList({
            filter: client.filter("order = {:id}", { id: order.id }),
          });
          return { ...order, items };
        })
      );
      const revenue = rows.reduce((sum, order) => sum + Number(order.total), 0);
      const storeCounts = new Map();
      rows.forEach((order) => {
        storeCounts.set(order.store, (storeCounts.get(order.store) || 0) + 1);
      });
      const productCounts = new Map();
      rows.flatMap((order) => order.items || []).forEach((item) => {
        productCounts.set(
          item.product_name_snapshot,
          (productCounts.get(item.product_name_snapshot) || 0) + Number(item.quantity)
        );
      });
      const topProduct = [...productCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const topStoreId = [...storeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      return {
        stores: stores.totalItems || 0,
        products: products.totalItems || 0,
        orders: rows.length,
        today: rows.length,
        revenue,
        topProduct,
        topStoreId,
        peakHour: null,
      };
    } catch (error) {
      console.error("PocketBase query failed", error);
      return null;
    }
  },
};
