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
  // Asia/Bangkok is UTC+7 all year. Intl is not available inside required hook modules.
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
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

module.exports = {
  AUTH,
  fail,
  ok,
  writeAudit,
  bodyOf,
  bangkokParts,
  parseDate,
  isServicePickupTime,
  pickupIsWithinOrderWindow,
  loginEmail,
  isAdmin,
  storeIdOf,
  requireActive,
  findById,
  exportRecord,
  nextOrderNumber,
  addNotification,
};
