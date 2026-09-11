import { randomBytes } from "node:crypto";
import { canCustomerCancel, canTransition } from "../js/order-status.js";
import { campusDateTimeParts } from "../js/campus-time.js";
import { parseOrderQuantity } from "../js/quantity.js";
import {
  adminConfigured,
  authFromHeader,
  createRecord,
  deleteRecord,
  findAll,
  findById,
  findFirst,
  pbFetch,
  updateRecord,
} from "./pocketbase-admin.js";

const AUTH = "oder_users";
const GRADES = new Set(["high_1", "high_2", "high_3"]);
const PICKUP_WINDOWS = [
  [8 * 60 + 35, 8 * 60 + 45],
  [9 * 60 + 30, 9 * 60 + 40],
  [10 * 60 + 25, 10 * 60 + 35],
  [11 * 60 + 20, 11 * 60 + 30],
  [12 * 60 + 15, 13 * 60],
  [17 * 60 + 15, 17 * 60 + 30],
  [18 * 60 + 15, 18 * 60 + 25],
];

function fail(code) {
  return { ok: false, code };
}

function ok(extra) {
  return { ok: true, ...(extra || {}) };
}

export function moneyInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) > 0.001) return null;
  return rounded;
}

export function loginEmail(username) {
  const value = String(username || "").trim().toLowerCase();
  return value.includes("@") ? value : `${value}@campus-order.test`;
}

function bangkokParts(date) {
  return campusDateTimeParts(date);
}

export function isServicePickupTime(date) {
  const parts = bangkokParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  return PICKUP_WINDOWS.some(([start, end]) => minutes >= start && minutes <= end);
}

export function pickupIsWithinOrderWindow(pickup, now) {
  if (pickup.getTime() < now.getTime() + 15 * 60 * 1000) return false;
  const pickupDay = bangkokParts(pickup);
  const limit = bangkokParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const pickupKey = pickupDay.year * 10000 + pickupDay.month * 100 + pickupDay.day;
  const limitKey = limit.year * 10000 + limit.month * 100 + limit.day;
  return pickupKey <= limitKey;
}

function isAdmin(record) {
  return record?.role === "admin" && record?.status === "active";
}

function storeIdOf(record) {
  return record?.role === "store" && record?.status === "active" ? String(record.store || "") : "";
}

function requireActive(record) {
  if (!record || record.status !== "active") return "bad_login";
  return "";
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

async function nextOrderNumber() {
  const parts = bangkokParts(new Date());
  const prefix = `ORD-${parts.year}${pad(parts.month, 2)}${pad(parts.day, 2)}-`;
  for (let i = 0; i < 20; i += 1) {
    const candidate = prefix + pad(Math.floor(Math.random() * 1000000), 6);
    const existing = await findFirst("orders", `order_number="${candidate}"`);
    if (!existing) return candidate;
  }
  return prefix + randomBytes(3).toString("hex").slice(0, 6);
}

async function requireUser(authorization) {
  if (!adminConfigured()) return { error: fail("server_not_configured") };
  const auth = await authFromHeader(authorization);
  if (!auth?.record) return { error: fail("session_expired") };
  const denied = requireActive(auth.record);
  if (denied) return { error: fail(denied) };
  return { auth };
}

export async function handleAppAction(action, { body = {}, authorization = "" } = {}) {
  if (!adminConfigured() && action !== "") return fail("server_not_configured");
  switch (action) {
    case "guest-login":
      return guestLogin();
    case "update-profile":
      return updateProfile(authorization, body);
    case "create-order":
      return createOrder(authorization, body);
    case "update-order-status":
      return updateOrderStatus(authorization, body);
    case "cancel-order":
      return cancelOrder(authorization, body);
    case "delete-product":
      return deleteProduct(authorization, body);
    case "delete-store":
      return deleteStore(authorization, body);
    case "mark-notification-read":
      return markNotificationRead(authorization, body);
    case "create-store-account":
      return createStoreAccount(authorization, body);
    case "reset-store-password":
      return resetStorePassword(authorization, body);
    case "disable-user":
      return disableUser(authorization, body);
    case "request-password-reset":
      return requestPasswordReset(body);
    default:
      return fail("not_found");
  }
}

async function guestLogin() {
  const id = randomBytes(8).toString("hex");
  const email = `guest_${id}@campus-order.test`;
  const password = `${randomBytes(16).toString("base64url")}Aa1`;
  const record = await createRecord(AUTH, {
    email,
    password,
    passwordConfirm: password,
    verified: true,
    role: "customer",
    status: "active",
    display_name: "",
  });
  const auth = await pbFetch(`/api/collections/${AUTH}/auth-with-password`, {
    method: "POST",
    body: { identity: email, password },
  });
  if (!auth.ok || !auth.data.token) return fail("backend_error");
  return { token: auth.data.token, record: auth.data.record || record };
}

async function updateProfile(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (auth.record.role !== "customer") return fail("bad_login");
  const displayName = String(body.display_name || "").trim();
  const grade = String(body.grade || "").trim();
  if (!displayName || displayName.length > 80) return fail("need_name");
  if (!GRADES.has(grade)) return fail("invalid_grade");
  const profile = await updateRecord(AUTH, auth.record.id, {
    display_name: displayName,
    name: displayName,
    grade,
  });
  return ok({ profile });
}

async function createOrder(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (auth.record.role !== "customer") return fail("bad_login");
  const storeId = String(body.store_id || "");
  const customerName = String(body.customer_name || "").trim();
  const pickup = body.pickup_time ? new Date(String(body.pickup_time)) : null;
  const payment = String(body.payment_method || "");
  const items = Array.isArray(body.items) ? body.items : [];
  const idempotencyKey = String(body.idempotency_key || "");
  if (!customerName || customerName.length > 80) return fail("need_name");
  if (!storeId || !pickup || Number.isNaN(pickup.getTime()) || !idempotencyKey) return fail("invalid_items");
  if (payment !== "cash" && payment !== "campus") return fail("invalid_payment");
  if (!items.length) return fail("invalid_items");

  const duplicate = await findFirst(
    "orders",
    `customer="${auth.record.id}" && idempotency_key="${idempotencyKey}"`
  );
  if (duplicate) return ok({ duplicate: true, order: duplicate });

  const store = await findById("stores", storeId);
  if (!store || store.status !== "open") return fail("store_closed");
  const parts = bangkokParts(pickup);
  if (
    !pickupIsWithinOrderWindow(pickup, new Date()) ||
    parts.minute % 5 !== 0 ||
    parts.second !== 0 ||
    !isServicePickupTime(pickup)
  ) {
    return fail("invalid_pickup");
  }

  const prepared = [];
  let total = 0;
  for (const item of items) {
    const qty = parseOrderQuantity(item.quantity);
    const product = await findById("products", String(item.product_id || ""));
    if (!product || product.store !== storeId || product.status !== "active") return fail("invalid_items");
    if (qty == null) return fail("invalid_items");
    const unit = moneyInt(product.price);
    if (unit == null) return fail("invalid_items");
    const subtotal = unit * qty;
    total += subtotal;
    prepared.push({
      product,
      quantity: qty,
      unit_price: unit,
      subtotal,
    });
  }

  await updateRecord(AUTH, auth.record.id, {
    display_name: customerName,
    name: customerName,
  });

  let order;
  try {
    order = await createRecord("orders", {
      order_number: await nextOrderNumber(),
      customer: auth.record.id,
      customer_name: customerName,
      ...(GRADES.has(auth.record.grade) ? { customer_grade: auth.record.grade } : {}),
      store: storeId,
      pickup_time: pickup.toISOString(),
      payment_method: payment,
      total,
      status: "pending",
      idempotency_key: idempotencyKey,
    });
    for (const row of prepared) {
      await createRecord("order_items", {
        order: order.id,
        product: row.product.id,
        product_name_snapshot: row.product.name,
        unit_price: row.unit_price,
        quantity: row.quantity,
        subtotal: row.subtotal,
      });
    }
    await createRecord("notifications", {
      store: storeId,
      order: order.id,
      type: "new_order",
      message: `新訂單 ${order.order_number}`,
      is_read: false,
    });
  } catch {
    if (order?.id) await deleteRecord("orders", order.id);
    const existing = await findFirst(
      "orders",
      `customer="${auth.record.id}" && idempotency_key="${idempotencyKey}"`
    );
    if (existing) return ok({ duplicate: true, order: existing });
    return fail("backend_error");
  }
  return ok({ order });
}

async function updateOrderStatus(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  const order = await findById("orders", String(body.order_id || ""));
  if (!order) return fail("no_order");
  if (!isAdmin(auth.record) && order.store !== storeIdOf(auth.record)) return fail("not_store");
  const next = String(body.next_status || "");
  if (!canTransition(order.status, next)) return fail("invalid_status");
  const updated = await updateRecord("orders", order.id, { status: next });
  await createRecord("notifications", {
    user: order.customer,
    store: order.store,
    order: order.id,
    type: "order_status",
    message: `${order.order_number}：${next}`,
    is_read: false,
  });
  return ok({ order: updated });
}

async function cancelOrder(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  const order = await findById("orders", String(body.order_id || ""));
  if (!order) return fail("no_order");
  const staff = isAdmin(auth.record) || order.store === storeIdOf(auth.record);
  if (!staff && order.customer !== auth.record.id) return fail("cannot_cancel");
  if (staff) {
    if (!["pending", "accepted", "preparing"].includes(order.status)) return fail("cannot_cancel");
  } else if (!canCustomerCancel(order.status)) {
    return fail("cannot_cancel");
  }
  const updated = await updateRecord("orders", order.id, { status: "cancelled" });
  return ok({ order: updated });
}

async function deleteProduct(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  const product = await findById("products", String(body.product_id || ""));
  if (!product) return fail("no_product");
  if (!isAdmin(auth.record) && product.store !== storeIdOf(auth.record)) return fail("not_store");
  const used = await findFirst("order_items", `product="${product.id}"`);
  if (used) {
    const hidden = await updateRecord("products", product.id, { status: "hidden" });
    return ok({ hidden: true, product: hidden });
  }
  const imageName = product.image;
  await deleteRecord("products", product.id);
  return ok({ deleted: true, image_path: imageName || "" });
}

async function deleteStore(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (!isAdmin(auth.record)) return fail("not_admin");
  const storeId = String(body.store_id || "");
  const store = await findById("stores", storeId);
  if (!store) return fail("no_store");
  const storeUsers = await findAll(AUTH, `store="${storeId}"`);
  for (const user of storeUsers) {
    await updateRecord(AUTH, user.id, { role: "customer", status: "disabled", store: "" });
  }
  const orders = await findAll("orders", `store="${storeId}"`);
  for (const order of orders) await deleteRecord("orders", order.id);
  const products = await findAll("products", `store="${storeId}"`);
  for (const product of products) await deleteRecord("products", product.id);
  await deleteRecord("stores", storeId);
  return ok({ deleted: true, orders: orders.length, products: products.length });
}

async function markNotificationRead(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  const row = await findById("notifications", String(body.notification_id || ""));
  if (!row) return fail("not_found");
  const allowed =
    isAdmin(auth.record) || row.user === auth.record.id || row.store === storeIdOf(auth.record);
  if (!allowed) return fail("not_found");
  await updateRecord("notifications", row.id, { is_read: true });
  return ok();
}

async function createStoreAccount(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (!isAdmin(auth.record)) return fail("not_admin");
  const storeId = String(body.store_id || "");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const displayName = String(body.display_name || "").trim() || username;
  if (!(await findById("stores", storeId))) return fail("no_store");
  if (!username || password.length < 4) return fail("invalid_account");
  const email = loginEmail(username);
  const existing = await findFirst(AUTH, `email="${email}"`);
  if (existing) return fail("username_taken");
  const record = await createRecord(AUTH, {
    email,
    password,
    passwordConfirm: password,
    verified: true,
    display_name: displayName.slice(0, 80),
    name: displayName.slice(0, 80),
    role: "store",
    store: storeId,
    status: "active",
  });
  return ok({ user_id: record.id, username });
}

async function resetStorePassword(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (!isAdmin(auth.record)) return fail("not_admin");
  const password = String(body.password || "");
  if (password.length < 4) return fail("password_too_short");
  const rows = await findAll(AUTH, `store="${String(body.store_id || "")}" && role="store"`);
  if (!rows.length) return fail("no_user");
  await updateRecord(AUTH, rows[0].id, { password, passwordConfirm: password });
  return ok();
}

async function disableUser(authorization, body) {
  const { auth, error } = await requireUser(authorization);
  if (error) return error;
  if (!isAdmin(auth.record)) return fail("not_admin");
  const userId = String(body.user_id || "");
  if (!userId || userId === auth.record.id) return fail("cannot_delete_admin");
  const user = await findById(AUTH, userId);
  if (!user) return fail("no_user");
  await updateRecord(AUTH, userId, { status: "disabled" });
  return ok({ user_id: userId });
}

async function requestPasswordReset(body) {
  const username = String(body.username || "").trim().toLowerCase().slice(0, 100);
  if (!username) return ok();
  const user = await findFirst(AUTH, `email="${loginEmail(username)}"`);
  if (user?.role === "store") {
    const admins = await findAll(AUTH, 'role="admin" && status="active"');
    for (const admin of admins) {
      await createRecord("notifications", {
        user: admin.id,
        store: user.store || "",
        type: "password_reset",
        message: `${user.display_name || user.name || username} 申請重設密碼`,
        is_read: false,
      });
    }
  }
  return ok();
}
