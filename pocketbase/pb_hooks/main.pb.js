/// <reference path="../pb_data/types.d.ts" />

const AUTH = "oder_users";

const PICKUP_WINDOWS = [
  [8 * 60 + 35, 8 * 60 + 45],
  [9 * 60 + 30, 9 * 60 + 40],
  [10 * 60 + 25, 10 * 60 + 35],
  [11 * 60 + 20, 11 * 60 + 30],
  [12 * 60 + 15, 13 * 60],
  [17 * 60 + 15, 17 * 60 + 30],
  [18 * 60 + 15, 18 * 60 + 25],
];

function fail(e, code) {
  return e.json(200, { ok: false, code: code });
}

function ok(e, extra) {
  return e.json(200, Object.assign({ ok: true }, extra || {}));
}

function writeAudit(e, payload) {
  try {
    const collection = e.app.findCollectionByNameOrId("admin_audit_logs");
    const row = new Record(collection);
    row.set("actor_id", String(e.auth?.id || ""));
    row.set("actor_role", String(e.auth?.get("role") || ""));
    row.set("store_id", String(payload.store_id || ""));
    row.set("store_name", String(payload.store_name || "").slice(0, 120));
    row.set("action", String(payload.action || ""));
    row.set("result", String(payload.result || ""));
    row.set("reason", String(payload.reason || "").slice(0, 300));
    row.set("impact_json", JSON.stringify(payload.impact || {}));
    e.app.save(row);
  } catch (err) {
    // Collection may not exist yet on older school DBs.
  }
}

function bodyOf(e) {
  return e.requestInfo().body || {};
}

function pad(n, width) {
  let s = String(n);
  while (s.length < width) s = "0" + s;
  return s;
}

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return null;
  return date;
}

function isServicePickupTime(date) {
  const parts = bangkokParts(date);
  const minutes = parts.hour * 60 + parts.minute;
  for (let i = 0; i < PICKUP_WINDOWS.length; i++) {
    if (minutes >= PICKUP_WINDOWS[i][0] && minutes <= PICKUP_WINDOWS[i][1]) return true;
  }
  return false;
}

function pickupIsWithinOrderWindow(pickup, now) {
  if (pickup.getTime() < now.getTime() + 15 * 60 * 1000) return false;
  const pickupDay = bangkokParts(pickup);
  const limit = bangkokParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const pickupKey = pickupDay.year * 10000 + pickupDay.month * 100 + pickupDay.day;
  const limitKey = limit.year * 10000 + limit.month * 100 + limit.day;
  return pickupKey <= limitKey;
}

function loginEmail(username) {
  const value = String(username || "").trim().toLowerCase();
  return value.indexOf("@") >= 0 ? value : value + "@campus-order.test";
}

function isAdmin(auth) {
  return Boolean(auth && auth.get("role") === "admin" && auth.get("status") === "active");
}

function storeIdOf(auth) {
  return auth && auth.get("role") === "store" && auth.get("status") === "active"
    ? String(auth.get("store") || "")
    : "";
}

function requireActive(e) {
  if (!e.auth || e.auth.get("status") !== "active") return "bad_login";
  return "";
}

function findById(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (err) {
    return null;
  }
}

function exportRecord(record) {
  return record ? record.publicExport() : null;
}

function nextOrderNumber(app) {
  const parts = bangkokParts(new Date());
  const prefix = "ORD-" + parts.year + pad(parts.month, 2) + pad(parts.day, 2) + "-";
  for (let i = 0; i < 20; i++) {
    const candidate = prefix + pad(Math.floor(Math.random() * 1000000), 6);
    try {
      app.findFirstRecordByFilter("orders", "order_number = {:n}", { n: candidate });
    } catch (err) {
      return candidate;
    }
  }
  return prefix + $security.randomStringWithAlphabet(6, "0123456789");
}

function addNotification(app, fields) {
  const collection = app.findCollectionByNameOrId("notifications");
  const row = new Record(collection);
  row.load(fields);
  app.save(row);
}

onRecordCreate((e) => {
  if (!e.record.get("role")) e.record.set("role", "customer");
  if (!e.record.get("status")) e.record.set("status", "active");
  if (!e.record.get("display_name") && e.record.get("name")) {
    e.record.set("display_name", e.record.get("name"));
  }
  e.next();
}, AUTH);

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  if (e.auth && e.auth.get("role") === "store") {
    e.record.set("store", e.auth.get("store"));
  }
  e.next();
}, "products");

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  if (e.auth && e.auth.get("role") === "store") {
    e.record.set("store", e.auth.get("store"));
  }
  e.next();
}, "products");

onRecordEnrich((e) => {
  const info = typeof e.requestInfo === "function" ? e.requestInfo() : e.requestInfo;
  const auth = info && info.auth;
  if (auth && auth.get("role") === "admin") e.record.unhide("email");
  e.next();
}, AUTH);

routerAdd("POST", "/api/app/guest-login", (e) => {
  const users = e.app.findCollectionByNameOrId(AUTH);
  const id = $security.randomStringWithAlphabet(16, "0123456789abcdef");
  const email = "guest_" + id + "@campus-order.test";
  const password = $security.randomString(20) + "Aa1";
  const record = new Record(users);
  record.set("email", email);
  record.set("password", password);
  record.set("passwordConfirm", password);
  record.set("verified", true);
  record.set("role", "customer");
  record.set("status", "active");
  record.set("display_name", "");
  e.app.save(record);
  return $apis.recordAuthResponse(e, record, "guest");
});

routerAdd(
  "POST",
  "/api/app/update-profile",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    if (e.auth.get("role") !== "customer") return fail(e, "bad_login");
    const body = bodyOf(e);
    const displayName = String(body.display_name || "").trim();
    const grade = String(body.grade || "").trim();
    if (!displayName || displayName.length > 80) return fail(e, "need_name");
    if (["high_1", "high_2", "high_3"].indexOf(grade) < 0) return fail(e, "invalid_grade");
    e.auth.set("display_name", displayName);
    e.auth.set("grade", grade);
    if (e.auth.collection().fields.getByName("name")) e.auth.set("name", displayName);
    e.app.save(e.auth);
    return ok(e, { profile: exportRecord(e.auth) });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/create-order",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    if (e.auth.get("role") !== "customer") return fail(e, "bad_login");
    const body = bodyOf(e);
    const storeId = String(body.store_id || "");
    const customerName = String(body.customer_name || "").trim();
    const pickup = parseDate(body.pickup_time);
    const payment = String(body.payment_method || "");
    const items = body.items;
    const idempotencyKey = String(body.idempotency_key || "");
    if (!customerName || customerName.length > 80) return fail(e, "need_name");
    if (!storeId || !pickup || !idempotencyKey) return fail(e, "invalid_items");
    if (payment !== "cash" && payment !== "campus") return fail(e, "invalid_payment");
    if (!items || typeof items !== "object" || !items.length) return fail(e, "invalid_items");

    try {
      const existing = e.app.findFirstRecordByFilter(
        "orders",
        "customer = {:cid} && idempotency_key = {:key}",
        { cid: e.auth.id, key: idempotencyKey }
      );
      return ok(e, { duplicate: true, order: exportRecord(existing) });
    } catch (err) {
      // new order
    }

    const store = findById(e.app, "stores", storeId);
    if (!store || store.get("status") !== "open") return fail(e, "store_closed");
    const parts = bangkokParts(pickup);
    if (
      !pickupIsWithinOrderWindow(pickup, new Date()) ||
      parts.minute % 5 !== 0 ||
      parts.second !== 0 ||
      !isServicePickupTime(pickup)
    ) {
      return fail(e, "invalid_pickup");
    }

    const prepared = [];
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const rawQty = items[i].quantity;
      let qty = null;
      if (typeof rawQty === "number") {
        if (Number.isFinite(rawQty) && rawQty === Math.floor(rawQty) && rawQty >= 1 && rawQty <= 99) {
          qty = rawQty;
        }
      } else if (typeof rawQty === "string") {
        const text = rawQty.trim();
        if (/^\d+$/.test(text)) {
          const n = Number(text);
          if (Number.isFinite(n) && n === Math.floor(n) && n >= 1 && n <= 99) qty = n;
        }
      }
      const product = findById(e.app, "products", String(items[i].product_id || ""));
      if (!product || product.get("store") !== storeId || product.get("status") !== "active") {
        return fail(e, "invalid_items");
      }
      if (qty == null) return fail(e, "invalid_items");
      const unit = Number(product.get("price"));
      const subtotal = unit * qty;
      total += subtotal;
      prepared.push({
        product: product,
        quantity: qty,
        unit_price: unit,
        subtotal: subtotal,
      });
    }

    e.auth.set("display_name", customerName);
    if (e.auth.collection().fields.getByName("name")) e.auth.set("name", customerName);
    e.app.save(e.auth);

    let order;
    try {
      e.app.runInTransaction((txApp) => {
        const orders = txApp.findCollectionByNameOrId("orders");
        order = new Record(orders);
        order.set("order_number", nextOrderNumber(txApp));
        order.set("customer", e.auth.id);
        order.set("customer_name", customerName);
        const grade = e.auth.get("grade");
        if (grade) order.set("customer_grade", grade);
        order.set("store", storeId);
        order.set("pickup_time", pickup.toISOString().replace("T", " "));
        order.set("payment_method", payment);
        order.set("total", total);
        order.set("status", "pending");
        order.set("idempotency_key", idempotencyKey);
        txApp.save(order);

        const itemCollection = txApp.findCollectionByNameOrId("order_items");
        for (let i = 0; i < prepared.length; i++) {
          const row = new Record(itemCollection);
          row.set("order", order.id);
          row.set("product", prepared[i].product.id);
          row.set("product_name_snapshot", prepared[i].product.get("name"));
          row.set("unit_price", prepared[i].unit_price);
          row.set("quantity", prepared[i].quantity);
          row.set("subtotal", prepared[i].subtotal);
          txApp.save(row);
        }

        addNotification(txApp, {
          store: storeId,
          order: order.id,
          type: "new_order",
          message: "新訂單 " + order.get("order_number"),
          is_read: false,
        });
      });
    } catch (err) {
      try {
        const existing = e.app.findFirstRecordByFilter(
          "orders",
          "customer = {:cid} && idempotency_key = {:key}",
          { cid: e.auth.id, key: idempotencyKey }
        );
        return ok(e, { duplicate: true, order: exportRecord(existing) });
      } catch (ignored) {
        return fail(e, "backend_error");
      }
    }

    return ok(e, { order: exportRecord(order) });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/update-order-status",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    const body = bodyOf(e);
    const order = findById(e.app, "orders", String(body.order_id || ""));
    if (!order) return fail(e, "no_order");
    if (!isAdmin(e.auth) && order.get("store") !== storeIdOf(e.auth)) return fail(e, "not_store");
    const current = String(order.get("status"));
    const next = String(body.next_status || "");
    const allowed =
      (current === "pending" && (next === "accepted" || next === "rejected")) ||
      (current === "accepted" && next === "preparing") ||
      (current === "preparing" && next === "ready") ||
      (current === "ready" && next === "completed");
    if (!allowed) return fail(e, "invalid_status");
    order.set("status", next);
    e.app.save(order);
    addNotification(e.app, {
      user: order.get("customer"),
      store: order.get("store"),
      order: order.id,
      type: "order_status",
      message: order.get("order_number") + "：" + next,
      is_read: false,
    });
    return ok(e, { order: exportRecord(order) });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/cancel-order",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    const order = findById(e.app, "orders", String(bodyOf(e).order_id || ""));
    if (!order) return fail(e, "no_order");
    const staff = isAdmin(e.auth) || order.get("store") === storeIdOf(e.auth);
    if (!staff && order.get("customer") !== e.auth.id) return fail(e, "cannot_cancel");
    const status = String(order.get("status"));
    if ((!staff && status !== "pending") || (staff && ["pending", "accepted", "preparing"].indexOf(status) < 0)) {
      return fail(e, "cannot_cancel");
    }
    order.set("status", "cancelled");
    e.app.save(order);
    return ok(e, { order: exportRecord(order) });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/delete-product",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    const product = findById(e.app, "products", String(bodyOf(e).product_id || ""));
    if (!product) return fail(e, "no_product");
    if (!isAdmin(e.auth) && product.get("store") !== storeIdOf(e.auth)) return fail(e, "not_store");
    const used = e.app.findRecordsByFilter(
      "order_items",
      "product = {:id}",
      "",
      1,
      0,
      { id: product.id }
    );
    if (used.length) {
      product.set("status", "hidden");
      e.app.save(product);
      return ok(e, { hidden: true, product: exportRecord(product) });
    }
    const imageName = product.get("image");
    e.app.delete(product);
    return ok(e, { deleted: true, image_path: imageName || "" });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/delete-store",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const storeId = String(bodyOf(e).store_id || "");
    const store = findById(e.app, "stores", storeId);
    if (!store) return fail(e, "no_store");
    const orders = e.app.findAllRecords("orders", $dbx.hashExp({ store: storeId }));
    if (orders.length) {
      writeAudit(e, {
        store_id: storeId,
        store_name: store.get("name"),
        action: "delete_store",
        result: "denied",
        reason: "store_has_orders",
        impact: { orders: orders.length },
      });
      return fail(e, "store_has_orders");
    }
    let productCount = 0;
    let userCount = 0;
    let imageCount = 0;
    try {
      e.app.runInTransaction((txApp) => {
        const storeUsers = txApp.findAllRecords(AUTH, $dbx.hashExp({ store: storeId }));
        userCount = storeUsers.length;
        for (let i = 0; i < storeUsers.length; i++) {
          storeUsers[i].set("role", "customer");
          storeUsers[i].set("status", "disabled");
          storeUsers[i].set("store", "");
          txApp.save(storeUsers[i]);
        }
        const notes = txApp.findAllRecords("notifications", $dbx.hashExp({ store: storeId }));
        for (let i = 0; i < notes.length; i++) txApp.delete(notes[i]);
        const reviews = txApp.findAllRecords("reviews", $dbx.hashExp({ store: storeId }));
        for (let i = 0; i < reviews.length; i++) txApp.delete(reviews[i]);
        const products = txApp.findAllRecords("products", $dbx.hashExp({ store: storeId }));
        productCount = products.length;
        for (let i = 0; i < products.length; i++) {
          if (products[i].get("image")) imageCount += 1;
          txApp.delete(products[i]);
        }
        txApp.delete(store);
      });
      writeAudit(e, {
        store_id: storeId,
        store_name: store.get("name"),
        action: "delete_store",
        result: "ok",
        reason: "",
        impact: { products: productCount, users: userCount, images: imageCount, orders: 0 },
      });
      return ok(e, { deleted: true, products: productCount, users: userCount, images: imageCount });
    } catch (err) {
      writeAudit(e, {
        store_id: storeId,
        store_name: store.get("name"),
        action: "delete_store",
        result: "error",
        reason: String(err || "store_delete_failed").slice(0, 300),
        impact: {},
      });
      return fail(e, "store_delete_failed");
    }
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/disable-store",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const storeId = String(bodyOf(e).store_id || "");
    const store = findById(e.app, "stores", storeId);
    if (!store) return fail(e, "no_store");
    store.set("status", "disabled");
    e.app.save(store);
    const users = e.app.findAllRecords(AUTH, $dbx.hashExp({ store: storeId, role: "store" }));
    for (let i = 0; i < users.length; i++) {
      users[i].set("status", "disabled");
      e.app.save(users[i]);
    }
    writeAudit(e, {
      store_id: storeId,
      store_name: store.get("name"),
      action: "disable_store",
      result: "ok",
      reason: "",
      impact: { users: users.length },
    });
    return ok(e, { disabled: true, store_id: storeId });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/enable-store",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const storeId = String(bodyOf(e).store_id || "");
    const store = findById(e.app, "stores", storeId);
    if (!store) return fail(e, "no_store");
    store.set("status", "open");
    e.app.save(store);
    const users = e.app.findAllRecords(AUTH, $dbx.hashExp({ store: storeId, role: "store" }));
    for (let i = 0; i < users.length; i++) {
      users[i].set("status", "active");
      e.app.save(users[i]);
    }
    writeAudit(e, {
      store_id: storeId,
      store_name: store.get("name"),
      action: "enable_store",
      result: "ok",
      reason: "",
      impact: { users: users.length },
    });
    return ok(e, { enabled: true, store_id: storeId, users: users.length });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/mark-notification-read",
  (e) => {
    const denied = requireActive(e);
    if (denied) return fail(e, denied);
    const row = findById(e.app, "notifications", String(bodyOf(e).notification_id || ""));
    if (!row) return fail(e, "not_found");
    const allowed =
      isAdmin(e.auth) || row.get("user") === e.auth.id || row.get("store") === storeIdOf(e.auth);
    if (!allowed) return fail(e, "not_found");
    row.set("is_read", true);
    e.app.save(row);
    return ok(e);
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/create-store-account",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const body = bodyOf(e);
    const storeId = String(body.store_id || "");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const displayName = String(body.display_name || "").trim() || username;
    if (!findById(e.app, "stores", storeId)) return fail(e, "no_store");
    if (!username || password.length < 4) return fail(e, "invalid_account");
    const email = loginEmail(username);
    try {
      e.app.findAuthRecordByEmail(AUTH, email);
      return fail(e, "username_taken");
    } catch (err) {
      // available
    }
    const users = e.app.findCollectionByNameOrId(AUTH);
    const record = new Record(users);
    record.set("email", email);
    record.set("password", password);
    record.set("passwordConfirm", password);
    record.set("verified", true);
    record.set("display_name", displayName.slice(0, 80));
    if (users.fields.getByName("name")) record.set("name", displayName.slice(0, 80));
    record.set("role", "store");
    record.set("store", storeId);
    record.set("status", "active");
    e.app.save(record);
    return ok(e, { user_id: record.id, username: username });
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/reset-store-password",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const body = bodyOf(e);
    const password = String(body.password || "");
    if (password.length < 4) return fail(e, "password_too_short");
    const rows = e.app.findAllRecords(
      AUTH,
      $dbx.hashExp({ store: String(body.store_id || ""), role: "store" })
    );
    if (!rows.length) return fail(e, "no_user");
    rows[0].set("password", password);
    rows[0].set("passwordConfirm", password);
    e.app.save(rows[0]);
    return ok(e);
  },
  $apis.requireAuth(AUTH)
);

routerAdd(
  "POST",
  "/api/app/disable-user",
  (e) => {
    if (!isAdmin(e.auth)) return fail(e, "not_admin");
    const userId = String(bodyOf(e).user_id || "");
    if (!userId || userId === e.auth.id) return fail(e, "cannot_delete_admin");
    const user = findById(e.app, AUTH, userId);
    if (!user) return fail(e, "no_user");
    user.set("status", "disabled");
    e.app.save(user);
    return ok(e, { user_id: userId });
  },
  $apis.requireAuth(AUTH)
);

routerAdd("POST", "/api/app/request-password-reset", (e) => {
  const username = String(bodyOf(e).username || "").trim().toLowerCase().slice(0, 100);
  if (!username) return ok(e);
  try {
    const user = e.app.findAuthRecordByEmail(AUTH, loginEmail(username));
    if (user.get("role") === "store") {
      const admins = e.app.findAllRecords(AUTH, $dbx.hashExp({ role: "admin", status: "active" }));
      for (let i = 0; i < admins.length; i++) {
        addNotification(e.app, {
          user: admins[i].id,
          store: user.get("store") || "",
          type: "password_reset",
          message: (user.get("display_name") || user.get("name") || username) + " 申請重設密碼",
          is_read: false,
        });
      }
    }
  } catch (err) {
    // same response whether or not the account exists
  }
  return ok(e);
});
