/** 金額、時間、訂單狀態顯示 */
import { SCHOOL_PICKUP_WINDOWS, normalizeServicePeriods } from "./service-periods.js";

export const STATUS_LABEL = {
  pending: "待店家接單",
  accepted: "店家已接單",
  preparing: "製作中",
  ready: "可取餐",
  completed: "已完成",
  cancelled: "已取消",
  rejected: "店家拒絕",
};

const TAIPEI_OFFSET = "+08:00";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Calendar date YYYY-MM-DD in Asia/Taipei (no DST). */
export function taipeiDateKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function addCalendarDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function atTaipei(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00${TAIPEI_OFFSET}`);
}

function taipeiClock(date) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function taipeiTimeParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { hour: get("hour"), minute: get("minute"), second: get("second") };
}

/**
 * Earliest instant in [open, close] that is >= earliest and aligned to intervalMinutes.
 * Uses absolute ms; Taipei is UTC+8 with no DST so 5-minute grids match the clock.
 */
function firstPickupInWindow(open, close, earliest, intervalMinutes) {
  const start = Math.max(open.getTime(), earliest.getTime());
  if (start > close.getTime()) return null;
  const intervalMs = intervalMinutes * 60 * 1000;
  let pickup = Math.ceil(start / intervalMs) * intervalMs;
  if (pickup < open.getTime()) pickup = open.getTime();
  if (pickup > close.getTime()) return null;
  return new Date(pickup);
}

export function money(n) {
  return "NT$ " + Number(n || 0).toLocaleString("zh-TW");
}

export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toTime24(raw, fallback = "10:00") {
  if (raw == null || raw === "") return fallback;
  let s = String(raw).trim();
  const am = /am|上午|เช้า/i.test(s);
  const pm = /pm|下午|เย็น|บ่าย/i.test(s);
  const m = s.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!m) return fallback;
  let h = Number(m[1]);
  const min = m[2];
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23) return fallback;
  return String(h).padStart(2, "0") + ":" + min;
}

export function parseTimeMinutes(raw) {
  const match = String(raw || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function legacyServiceWindow(store, now) {
  const openMinutes = parseTimeMinutes(store?.open_time);
  const closeMinutes = parseTimeMinutes(store?.close_time);
  if (openMinutes == null || closeMinutes == null || openMinutes === closeMinutes) return null;

  const open = new Date(now);
  open.setHours(0, openMinutes, 0, 0);
  const close = new Date(now);
  close.setHours(0, closeMinutes, 0, 0);

  if (closeMinutes <= openMinutes) {
    if (now.getHours() * 60 + now.getMinutes() < closeMinutes) {
      open.setDate(open.getDate() - 1);
    } else {
      close.setDate(close.getDate() + 1);
    }
  }

  return { open, close };
}

function serviceWindows(store, dateOrKey) {
  const periods = normalizeServicePeriods(store?.service_periods);
  if (!periods.length) {
    const date = dateOrKey instanceof Date ? dateOrKey : atTaipei(dateOrKey, "12:00");
    const legacy = legacyServiceWindow(store, date);
    return legacy ? [legacy] : [];
  }
  const key = typeof dateOrKey === "string" ? dateOrKey : taipeiDateKey(dateOrKey);
  return SCHOOL_PICKUP_WINDOWS.map(([openValue, closeValue]) => ({
    open: atTaipei(key, openValue),
    close: atTaipei(key, closeValue),
  }));
}

function pickupDayAllowed(pickup, now) {
  const day = taipeiDateKey(pickup);
  const today = taipeiDateKey(now);
  return day === today || day === addCalendarDays(today, 1);
}

export function isPickupTimeAllowed(store, pickupTime, now = new Date()) {
  if (!store || store.status !== "open") return false;
  const pickup = new Date(pickupTime);
  if (Number.isNaN(pickup.getTime())) return false;
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  if (pickup < earliest || !pickupDayAllowed(pickup, now)) return false;
  const interval = normalizeServicePeriods(store.service_periods).length ? 5 : 15;
  const { minute, second } = taipeiTimeParts(pickup);
  if (minute % interval !== 0 || second !== 0) return false;

  return serviceWindows(store, pickup).some((window) => pickup >= window.open && pickup <= window.close);
}

export function pickupSlotsForStore(store, now = new Date()) {
  if (!store || store.status !== "open") return [];
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  const periods = normalizeServicePeriods(store.service_periods);
  const interval = periods.length ? 5 : 15;
  const byLabel = new Map();
  const today = taipeiDateKey(now);
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const key = addCalendarDays(today, dayOffset);
    const windows = periods.length
      ? serviceWindows(store, key)
      : serviceWindows(store, atTaipei(key, "12:00"));
    for (const window of windows) {
      const pickup = firstPickupInWindow(window.open, window.close, earliest, interval);
      if (!pickup) continue;
      const label = `${taipeiClock(window.open)}–${taipeiClock(window.close)}`;
      if (!byLabel.has(label)) {
        byLabel.set(label, { value: pickup.toISOString(), label });
      }
    }
  }
  return [...byLabel.values()];
}

/** Backwards-compatible default slots for pages that do not have store data. */
export function todaySlots() {
  return pickupSlotsForStore({ status: "open", open_time: "00:00", close_time: "23:59" });
}

/** 本地日期 YYYY-MM-DD，供每日訂單歷史 */
export function dateKey(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(iso) {
  const k = dateKey(iso);
  if (!k) return "—";
  const [y, m, d] = k.split("-");
  return `${Number(m)}/${Number(d)} (${y})`;
}
