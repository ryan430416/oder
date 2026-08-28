import { auth } from "./auth.js";
import { getSupabase, rpc } from "./supabase.js";
import { normalizeServicePeriods, servicePeriodBounds } from "./service-periods.js";

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
  };
}

function normalizeProduct(row, runtimeUrl = "") {
  if (!row) return null;
  return {
    ...row,
    product_id: row.id,
    product_name: row.name,
    image: runtimeUrl || row.image_url || "",
  };
}

function normalizeOrder(row) {
  if (!row) return null;
  return {
    ...row,
    order_id: row.id,
    items: (row.items || []).map((item) => ({
      ...item,
      order_item_id: item.id,
      product_id: item.product_id || "",
      product_name: item.product_name_snapshot,
    })),
  };
}

function queryFailure(error, fallback = []) {
  if (error) console.error("Supabase query failed", error);
  return fallback;
}

async function withProductUrls(rows) {
  const client = await getSupabase();
  return Promise.all(
    (rows || []).map(async (row) => {
      if (!row.image_path) return normalizeProduct(row);
      const { data } = await client.storage
        .from("product-images")
        .createSignedUrl(row.image_path, 3600);
      return normalizeProduct(row, data?.signedUrl || "");
    })
  );
}

async function orderQuery(column, value) {
  const client = await getSupabase();
  let query = client
    .from("orders")
    .select("*, items:order_items(*)")
    .order("created_at", { ascending: false });
  if (column && value) query = query.eq(column, value);
  const { data, error } = await query;
  return error ? queryFailure(error) : (data || []).map(normalizeOrder);
}

async function accessToken() {
  const client = await getSupabase();
  const { data } = await client.auth.getSession();
  return data.session?.access_token || "";
}

async function adminRequest(path, body) {
  const token = await accessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ ok: false, code: "backend_error" }));
  return response.ok ? result : { ok: false, code: result.code || "backend_error" };
}

export const supabaseApi = {
  async getStores() {
    const client = await getSupabase();
    const { data, error } = await client.from("stores").select("*").order("created_at");
    return error ? queryFailure(error) : (data || []).map(normalizeStore);
  },

  async getStore(storeId) {
    const client = await getSupabase();
    const { data, error } = await client.from("stores").select("*").eq("id", storeId).maybeSingle();
    return error ? queryFailure(error, null) : normalizeStore(data);
  },

  async getProducts(storeId) {
    const client = await getSupabase();
    const { data, error } = await client
      .from("products")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");
    return error ? queryFailure(error) : withProductUrls(data);
  },

  async updateCustomerProfile(name, grade) {
    return auth.setCustomerProfile(name, grade);
  },

  async createOrder({ customer_name, store_id, pickup_time, payment_method, items, idempotency_key }) {
    return rpc("create_order", {
      p_store_id: store_id,
      p_customer_name: customer_name,
      p_pickup_time: pickup_time,
      p_payment_method: payment_method,
      p_items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
      p_idempotency_key: idempotency_key || crypto.randomUUID(),
    });
  },

  async getCustomerOrders() {
    const current = auth.getSession();
    return current ? orderQuery("customer_id", current.user_id) : [];
  },

  async getStoreOrders() {
    const storeId = auth.getBoundStoreId();
    return storeId ? orderQuery("store_id", storeId) : [];
  },

  updateOrderStatus(orderId, nextStatus) {
    return rpc("update_order_status", {
      p_order_id: orderId,
      p_next_status: nextStatus,
    });
  },

  cancelOrder(orderId) {
    return rpc("cancel_order", { p_order_id: orderId });
  },

  async getNotifications() {
    const client = await getSupabase();
    const { data, error } = await client
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return queryFailure(error);
    return (data || []).map((item) => ({
      ...item,
      notification_id: item.id,
      key: item.type,
      read: item.is_read,
      vars: { message: item.message },
    }));
  },

  async markNotificationRead(id) {
    return rpc("mark_notification_read", { p_notification_id: id });
  },

  async requestPasswordReset(username) {
    try {
      const response = await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      return response.ok ? { ok: true } : { ok: false, code: "backend_error" };
    } catch {
      return { ok: false, code: "backend_error" };
    }
  },

  async resetStorePassword(storeId, newPassword) {
    const result = await rpc("reset_store_password", {
      p_store_id: storeId,
      p_password: newPassword,
    });
    if (result?.ok) return result;
    return adminRequest("/api/admin/reset-store-password", {
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
    const account = await rpc("create_store_account", {
      p_store_id: storeId,
      p_username: username,
      p_password: password,
      p_display_name: displayName,
    });
    if (account?.ok || (account?.code && account.code !== "backend_error")) return account;
    return adminRequest("/api/admin/create-store-user", {
      store_id: storeId,
      username,
      password,
      display_name: displayName,
    });
  },

  async createStore(payload) {
    const client = await getSupabase();
    const periods = normalizeServicePeriods(payload.service_periods);
    if (!periods.length) return { ok: false, code: "need_service_period" };
    const bounds = servicePeriodBounds(periods);
    const storeId = crypto.randomUUID();
    const { data, error } = await client
      .from("stores")
      .insert({
        id: storeId,
        name: String(payload.store_name || "").trim(),
        description: String(payload.description || "").trim(),
        image_url: payload.image && /^https:\/\//.test(payload.image) ? payload.image : null,
        open_time: bounds.open_time,
        close_time: bounds.close_time,
        service_periods: periods,
        status: "open",
      })
      .select()
      .single();
    if (error) return { ok: false, code: "backend_error", message: error.message };
    const account = await this.createStoreAccount(storeId, payload.username, payload.password, data.name);
    if (!account.ok) {
      await client.from("stores").delete().eq("id", storeId);
      return account;
    }
    return { ok: true, store: normalizeStore(data), username: payload.username };
  },

  async updateStore(storeId, patch) {
    const periods =
      patch.service_periods == null ? null : normalizeServicePeriods(patch.service_periods);
    if (periods && !periods.length) return { ok: false, code: "need_service_period" };
    const values = {};
    if (patch.store_name != null) values.name = String(patch.store_name).trim();
    if (patch.description != null) values.description = String(patch.description).trim();
    if (patch.status != null) values.status = patch.status;
    if (patch.image && /^https:\/\//.test(patch.image)) values.image_url = patch.image;
    if (periods) {
      const bounds = servicePeriodBounds(periods);
      Object.assign(values, bounds, { service_periods: periods });
    }
    const client = await getSupabase();
    const { data, error } = await client
      .from("stores")
      .update(values)
      .eq("id", storeId)
      .select()
      .single();
    if (error) return { ok: false, code: "backend_error", message: error.message };
    if (patch.status === "disabled" || patch.status === "open") {
      await client
        .from("profiles")
        .update({ status: patch.status === "disabled" ? "disabled" : "active" })
        .eq("store_id", storeId)
        .eq("role", "store");
    }
    return { ok: true, store: normalizeStore(data) };
  },

  async deleteStore(storeId) {
    const client = await getSupabase();
    const { count } = await client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    if (count) return this.updateStore(storeId, { status: "disabled" });
    const { error } = await client.from("stores").delete().eq("id", storeId);
    return error ? { ok: false, code: "backend_error" } : { ok: true };
  },

  async getStoreImpact(storeId) {
    const client = await getSupabase();
    const [products, orders, users] = await Promise.all([
      client.from("products").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      client.from("orders").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      client.from("profiles").select("id", { count: "exact", head: true }).eq("store_id", storeId),
    ]);
    return {
      products: products.count || 0,
      orders: orders.count || 0,
      users: users.count || 0,
    };
  },

  async createProduct(payload) {
    const client = await getSupabase();
    const id = payload.product_id || crypto.randomUUID();
    const { data, error } = await client
      .from("products")
      .insert({
        id,
        store_id: payload.store_id || auth.getBoundStoreId(),
        name: String(payload.product_name || "").trim(),
        category: String(payload.category || "").trim(),
        description: String(payload.description || "").trim(),
        price: Number(payload.price),
        image_path: payload.image_path || null,
        status: payload.status || "active",
      })
      .select()
      .single();
    return error
      ? { ok: false, code: "backend_error", message: error.message }
      : { ok: true, product: normalizeProduct(data) };
  },

  async updateProduct(productId, patch) {
    const values = {};
    if (patch.product_name != null) values.name = String(patch.product_name).trim();
    if (patch.category != null) values.category = String(patch.category).trim();
    if (patch.description != null) values.description = String(patch.description).trim();
    if (patch.price != null) values.price = Number(patch.price);
    if (patch.image_path !== undefined) values.image_path = patch.image_path || null;
    if (patch.status != null) values.status = patch.status;
    const client = await getSupabase();
    const { data, error } = await client
      .from("products")
      .update(values)
      .eq("id", productId)
      .select()
      .single();
    return error
      ? { ok: false, code: "backend_error", message: error.message }
      : { ok: true, product: normalizeProduct(data) };
  },

  deleteProduct(productId) {
    return rpc("delete_or_hide_product", { p_product_id: productId });
  },

  async getAdminUsers() {
    const client = await getSupabase();
    const { data, error } = await client.from("profiles").select("*").order("created_at");
    if (error) return queryFailure(error);
    return (data || []).map((row) => ({
      ...row,
      user_id: row.id,
      name: row.display_name,
    }));
  },

  deleteUserAccount(userId) {
    return adminRequest("/api/admin/disable-user", { user_id: userId });
  },

  async setUserStatus(userId, status) {
    const client = await getSupabase();
    const { error } = await client
      .from("profiles")
      .update({ status })
      .eq("id", userId);
    return error ? { ok: false, code: "backend_error" } : { ok: true };
  },

  async getAdminReviews() {
    const client = await getSupabase();
    const { data, error } = await client.from("reviews").select("*").order("created_at", {
      ascending: false,
    });
    return error ? queryFailure(error) : data || [];
  },

  async getAdminStats() {
    const client = await getSupabase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [stores, products, orders] = await Promise.all([
      client.from("stores").select("id", { count: "exact", head: true }),
      client.from("products").select("id", { count: "exact", head: true }),
      client.from("orders").select("total, store_id, items:order_items(product_name_snapshot, quantity)").gte(
        "created_at",
        today.toISOString()
      ),
    ]);
    if (stores.error || products.error || orders.error) return null;
    const rows = orders.data || [];
    const revenue = rows.reduce((sum, order) => sum + Number(order.total), 0);
    const storeCounts = new Map();
    rows.forEach((order) => {
      storeCounts.set(order.store_id, (storeCounts.get(order.store_id) || 0) + 1);
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
      stores: stores.count || 0,
      products: products.count || 0,
      orders: rows.length,
      today: rows.length,
      revenue,
      topProduct,
      topStoreId,
      peakHour: null,
    };
  },
};
