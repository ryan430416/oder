import { AUTH_COLLECTION } from "./collections.js";
import { auth } from "./auth.js";
import { appSend, getPocketBase } from "./pocketbase.js";
import { LEGACY_STORE_SERVICE_PERIODS, normalizeServicePeriods, servicePeriodBounds } from "./service-periods.js";
import { normalizeStoreImage } from "./store-image.js";
import {
  canPermanentlyDeleteStore,
  pocketBaseCreatedRangeFilter,
  sanitizeAdminUser,
  statusDistribution,
  sumTrustedRevenue,
  topKeyedCount,
} from "./admin-data.js";
import { campusDateKey } from "./campus-time.js";

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
  if (error) {
    const status = error?.status || error?.response?.status || "";
    const code = error?.data?.code || error?.response?.data?.code || error?.message || "backend_error";
    console.error("PocketBase query failed", { status, code });
  }
  return fallback;
}

function queryErrorResult(error) {
  const status = error?.status || error?.response?.status || 0;
  const code = error?.data?.code || error?.response?.data?.code || "backend_error";
  console.error("PocketBase query failed", { status, code });
  return { ok: false, data: [], code: "backend_error", status, errorCode: code };
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
  const options = { sort: "-created" };
  if (column && value) options.filter = client.filter(`${column} = {:value}`, { value });
  const orders = await client.collection("orders").getFullList(options);
  if (!orders.length) return [];
  const byOrder = new Map();
  for (const order of orders) {
    try {
      const items = await client.collection("order_items").getFullList({
        filter: client.filter("order = {:id}", { id: order.id }),
      });
      byOrder.set(order.id, items);
    } catch (error) {
      console.error("PocketBase query failed", {
        status: error?.status || "",
        code: error?.data?.code || error?.message || "order_items",
      });
      byOrder.set(order.id, []);
    }
  }
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
    if (!current) return [];
    try {
      return await orderQuery("customer", current.user_id);
    } catch (error) {
      return queryFailure(error);
    }
  },

  async getStoreOrders() {
    const storeId = auth.getBoundStoreId();
    if (!storeId) return [];
    try {
      return await orderQuery("store", storeId);
    } catch (error) {
      return queryFailure(error);
    }
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
      if (patch.status === "disabled" || patch.status === "open" || patch.status === "closed") {
        const users = await client.collection(AUTH_COLLECTION).getFullList({
          filter: client.filter("store = {:id} && role = 'store'", { id: storeId }),
        });
        const nextUserStatus = patch.status === "disabled" ? "disabled" : "active";
        await Promise.all(
          users.map((user) =>
            client.collection(AUTH_COLLECTION).update(user.id, {
              status: nextUserStatus,
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

  disableStore(storeId) {
    return appSend("/api/app/disable-store", { store_id: storeId });
  },

  enableStore(storeId) {
    return appSend("/api/app/enable-store", { store_id: storeId });
  },

  async getStoreImpact(storeId) {
    try {
      const client = await getPocketBase();
      const filter = client.filter("store = {:id}", { id: storeId });
      const [products, orders, users, notifications, reviews] = await Promise.all([
        client.collection("products").getList(1, 1, { filter }),
        client.collection("orders").getList(1, 1, { filter }),
        client.collection(AUTH_COLLECTION).getList(1, 1, { filter }),
        client.collection("notifications").getList(1, 1, { filter }),
        client.collection("reviews").getList(1, 1, { filter }),
      ]);
      let images = 0;
      try {
        const productRows = await client.collection("products").getFullList({ filter });
        images = productRows.filter((row) => fileName(row.image)).length;
      } catch {
        images = 0;
      }
      return {
        ok: true,
        products: products.totalItems || 0,
        orders: orders.totalItems || 0,
        users: users.totalItems || 0,
        notifications: notifications.totalItems || 0,
        reviews: reviews.totalItems || 0,
        images,
        canDelete: canPermanentlyDeleteStore({ orders: orders.totalItems || 0 }),
      };
    } catch (error) {
      return { ok: false, code: "backend_error", products: 0, orders: 0, users: 0, images: 0, canDelete: false };
    }
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
      const viaApi = await appSend("/api/app/admin-users", {});
      if (viaApi?.ok && Array.isArray(viaApi.users)) {
        return { ok: true, data: viaApi.users.map(sanitizeAdminUser).filter(Boolean) };
      }
      if (viaApi && viaApi.ok === false && viaApi.code && viaApi.code !== "not_found" && viaApi.code !== "server_not_configured") {
        return { ok: false, data: [], code: viaApi.code === "not_admin" ? "permission_denied" : "users_load_failed" };
      }
    } catch {
      /* fall through to client query */
    }
    try {
      const client = await getPocketBase();
      // Avoid empty filter strings; page through instead of one giant full list when possible.
      const data = await client.collection(AUTH_COLLECTION).getFullList({
        sort: "-created",
        fields: "id,email,display_name,role,status,store,grade,created",
      });
      return { ok: true, data: data.map(sanitizeAdminUser).filter(Boolean) };
    } catch (error) {
      // Retry without fields in case school schema lacks one of them (fields mistmatch → 400).
      try {
        const client = await getPocketBase();
        const data = await client.collection(AUTH_COLLECTION).getFullList({ sort: "-created" });
        return { ok: true, data: data.map(sanitizeAdminUser).filter(Boolean) };
      } catch (retryError) {
        return queryErrorResult(retryError);
      }
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

  async getAdminOrders() {
    try {
      const viaApi = await appSend("/api/app/admin-orders", {});
      if (viaApi?.ok && Array.isArray(viaApi.orders)) {
        return { ok: true, data: viaApi.orders.map((row) => normalizeOrder(row)) };
      }
    } catch {
      /* client fallback */
    }
    try {
      const data = await orderQuery();
      return { ok: true, data };
    } catch (error) {
      return queryErrorResult(error);
    }
  },

  async getAdminStats() {
    try {
      const viaApi = await appSend("/api/app/admin-stats", {});
      if (viaApi?.ok && viaApi.stats) return { ok: true, data: viaApi.stats };
    } catch {
      /* client fallback */
    }
    try {
      const client = await getPocketBase();
      const dayKey = campusDateKey();
      const todayFilter = pocketBaseCreatedRangeFilter(dayKey);
      const [stores, products, allOrdersPage, todayOrders] = await Promise.all([
        client.collection("stores").getList(1, 1),
        client.collection("products").getList(1, 1),
        client.collection("orders").getList(1, 1),
        client.collection("orders").getFullList({
          filter: todayFilter,
          sort: "-created",
        }),
      ]);
      const rows = [];
      for (const order of todayOrders || []) {
        let items = [];
        try {
          items = await client.collection("order_items").getFullList({
            filter: client.filter("order = {:id}", { id: order.id }),
          });
        } catch {
          items = [];
        }
        rows.push({ ...order, items });
      }
      const revenue = sumTrustedRevenue(rows);
      const storeCounts = new Map();
      rows.forEach((order) => {
        if (!isRevenueOrderSafe(order)) return;
        storeCounts.set(order.store, (storeCounts.get(order.store) || 0) + 1);
      });
      const productCounts = new Map();
      rows.forEach((order) => {
        if (!isRevenueOrderSafe(order)) return;
        (order.items || []).forEach((item) => {
          const name = item.product_name_snapshot || item.product_name || "";
          if (!name) return;
          productCounts.set(name, (productCounts.get(name) || 0) + Number(item.quantity || 0));
        });
      });
      return {
        ok: true,
        data: {
          stores: stores.totalItems || 0,
          products: products.totalItems || 0,
          orders: allOrdersPage.totalItems || 0,
          today: rows.length,
          revenue,
          topProduct: topKeyedCount(productCounts.entries()),
          topStoreId: topKeyedCount(storeCounts.entries()),
          statusCounts: statusDistribution(rows),
          dateKey: dayKey,
        },
      };
    } catch (error) {
      console.error("PocketBase query failed", {
        status: error?.status || "",
        code: error?.data?.code || error?.message || "admin_stats",
      });
      return { ok: false, data: null, code: "backend_error" };
    }
  },
};

function isRevenueOrderSafe(order) {
  const status = String(order?.status || "");
  return status !== "cancelled" && status !== "rejected";
}
