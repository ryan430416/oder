import { config } from "./config.js";
import { storage } from "./storage.js";
import { getSupabase, rpc } from "./supabase.js";

function session() {
  return storage.get(config.SESSION_KEY, null);
}

function token() {
  return session()?.token || "";
}

function normalizeStore(store) {
  if (!store) return store;
  return {
    ...store,
    open_time: String(store.open_time || "").slice(0, 5),
    close_time: String(store.close_time || "").slice(0, 5),
  };
}

async function ensureCustomerSession() {
  const current = session();
  if (current?.role === "customer" && current.token) return current;
  const guest = storage.get(config.GUEST_KEY, null);
  if (guest?.token) return guest;
  const result = await rpc("create_guest_session", {
    p_name: guest?.name || current?.name || "學生小明",
  });
  if (!result?.ok) return null;
  storage.set(config.GUEST_KEY, result.session);
  if (!current || current.role === "customer") {
    storage.set(config.SESSION_KEY, result.session);
  }
  return result.session;
}

function failure(error) {
  if (error) console.error("Supabase query failed", error);
  return [];
}

async function orderQuery(filters = []) {
  try {
    const client = await getSupabase();
    let query = client
      .from("orders")
      .select("*, items:order_items(*)")
      .order("created_at", { ascending: false });
    filters.forEach(([column, value]) => {
      query = query.eq(column, value);
    });
    const { data, error } = await query;
    return error ? failure(error) : data || [];
  } catch (error) {
    return failure(error);
  }
}

export const supabaseApi = {
  async getStores() {
    try {
      const client = await getSupabase();
      const { data, error } = await client.from("stores").select("*").order("store_id");
      return error ? failure(error) : (data || []).map(normalizeStore);
    } catch (error) {
      return failure(error);
    }
  },

  async getStore(storeId) {
    try {
      const client = await getSupabase();
      const { data, error } = await client
        .from("stores")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) failure(error);
      return normalizeStore(data) || null;
    } catch (error) {
      failure(error);
      return null;
    }
  },

  async getProducts(storeId) {
    try {
      const client = await getSupabase();
      const { data, error } = await client
        .from("products")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at");
      return error ? failure(error) : data || [];
    } catch (error) {
      return failure(error);
    }
  },

  async createOrder({ customer_name, store_id, pickup_time, payment_method, items }) {
    const customer = await ensureCustomerSession();
    if (!customer) return { ok: false, code: "backend_error" };
    return rpc("create_order", {
      p_token: customer.token,
      p_customer_name: customer_name,
      p_store_id: store_id,
      p_pickup_time: pickup_time,
      p_payment_method: payment_method,
      p_items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
    });
  },

  async getCustomerOrders() {
    const customer = await ensureCustomerSession();
    if (!customer) return [];
    const data = await rpc("get_customer_orders", { p_token: customer.token });
    return Array.isArray(data) ? data : [];
  },

  getStoreOrders() {
    const storeId = session()?.store_id;
    return storeId ? orderQuery([["store_id", storeId]]) : Promise.resolve([]);
  },

  updateOrderStatus(orderId, nextStatus) {
    return rpc("update_order_status", {
      p_token: token(),
      p_order_id: orderId,
      p_next_status: nextStatus,
    });
  },

  cancelOrder(orderId) {
    const current = session();
    return rpc("cancel_order", {
      p_token: current?.token || "",
      p_order_id: orderId,
    });
  },

  async getNotifications() {
    let current = session();
    if (!current || current.role === "customer") current = await ensureCustomerSession();
    const data = await rpc("get_notifications", {
      p_token: current?.token || "",
    });
    return Array.isArray(data) ? data : [];
  },

  markNotificationRead(id) {
    const current = session();
    return rpc("mark_notification_read", {
      p_token: current?.token || "",
      p_notification_id: id,
    });
  },

  requestPasswordReset(username) {
    return rpc("request_password_reset", { p_username: username });
  },

  resetStorePassword(storeId, newPassword) {
    return rpc("reset_store_password", {
      p_token: token(),
      p_store_id: storeId,
      p_new_password: newPassword,
    });
  },

  async getPasswordResets() {
    const data = await rpc("get_password_resets", { p_token: token() });
    return Array.isArray(data) ? data : [];
  },

  getAdminOrders() {
    return session()?.role === "admin" ? orderQuery() : Promise.resolve([]);
  },

  createStore(payload) {
    return rpc("create_store", {
      p_token: token(),
      p_store_name: payload.store_name,
      p_description: payload.description || "",
      p_open_time: payload.open_time || "10:00",
      p_close_time: payload.close_time || "20:00",
      p_image: payload.image || "🏪",
      p_username: payload.username,
      p_password: payload.password,
    });
  },

  async updateStore(storeId, patch) {
    const current = await this.getStore(storeId);
    if (!current) return { ok: false, code: "no_store" };
    return rpc("update_store", {
      p_token: token(),
      p_store_id: storeId,
      p_store_name: patch.store_name ?? current.store_name,
      p_description: patch.description ?? current.description,
      p_open_time: patch.open_time ?? current.open_time,
      p_close_time: patch.close_time ?? current.close_time,
      p_status: patch.status ?? current.status,
      p_image: patch.image ?? current.image,
    });
  },

  deleteStore(storeId) {
    return rpc("delete_store", { p_token: token(), p_store_id: storeId });
  },

  createProduct(payload) {
    return rpc("mutate_product", {
      p_token: token(),
      p_action: "create",
      p_product_id: null,
      p_store_id: payload.store_id || session()?.store_id || "",
      p_product_name: payload.product_name,
      p_category: payload.category || "",
      p_description: payload.description || "",
      p_price: Number(payload.price),
      p_image: payload.image || "🍽️",
      p_status: payload.status || "active",
    });
  },

  async updateProduct(productId, patch) {
    const current = (await this.getProducts(patch.store_id || session()?.store_id || "")).find(
      (product) => product.product_id === productId
    );
    if (!current) {
      try {
        const client = await getSupabase();
        const { data } = await client.from("products").select("*").eq("product_id", productId).maybeSingle();
        if (!data) return { ok: false, code: "no_product" };
        return this.updateProduct(productId, { ...data, ...patch, store_id: data.store_id });
      } catch {
        return { ok: false, code: "no_product" };
      }
    }
    return rpc("mutate_product", {
      p_token: token(),
      p_action: "update",
      p_product_id: productId,
      p_store_id: current.store_id,
      p_product_name: patch.product_name ?? current.product_name,
      p_category: patch.category ?? current.category,
      p_description: patch.description ?? current.description,
      p_price: Number(patch.price ?? current.price),
      p_image: patch.image ?? current.image,
      p_status: patch.status ?? current.status,
    });
  },

  deleteProduct(productId) {
    return rpc("mutate_product", {
      p_token: token(),
      p_action: "delete",
      p_product_id: productId,
      p_store_id: null,
      p_product_name: null,
      p_category: null,
      p_description: null,
      p_price: null,
      p_image: null,
      p_status: null,
    });
  },

  async getAdminUsers() {
    const data = await rpc("get_admin_users", { p_token: token() });
    return Array.isArray(data) ? data : [];
  },

  deleteUserAccount(userId) {
    return rpc("delete_user_account", {
      p_token: token(),
      p_user_id: userId,
    });
  },

  async getAdminReviews() {
    const data = await rpc("get_admin_reviews", { p_token: token() });
    return Array.isArray(data) ? data : [];
  },

  getAdminStats() {
    return rpc("get_admin_stats", { p_token: token() });
  },
};
