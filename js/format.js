/** 金額、時間、訂單狀態顯示 */
import { SCHOOL_PICKUP_WINDOWS, normalizeServicePeriods } from "./service-periods.js";
import {
  addCalendarDays,
  atCampus,
  campusClock,
  campusDateKey,
  campusDateKeyFromIso,
  campusTimeParts,
  formatCampusDateTime,
} from "./campus-time.js";

export const STATUS_LABEL = {
  pending: "待店家接單",
  accepted: "店家已接單",
  preparing: "製作中",
  ready: "可取餐",
  completed: "已完成",
  cancelled: "已取消",
  rejected: "店家拒絕",
};

/**
 * Earliest instant in [open, close] that is >= earliest and aligned to intervalMinutes.
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
  return formatCampusDateTime(iso);
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

function legacyServiceWindow(store, referenceDate) {
  const openMinutes = parseTimeMinutes(store?.open_time);
  const closeMinutes = parseTimeMinutes(store?.close_time);
  if (openMinutes == null || closeMinutes == null || openMinutes === closeMinutes) return null;

  const openHhmm = `${String(Math.floor(openMinutes / 60)).padStart(2, "0")}:${String(openMinutes % 60).padStart(2, "0")}`;
  const closeHhmm = `${String(Math.floor(closeMinutes / 60)).padStart(2, "0")}:${String(closeMinutes % 60).padStart(2, "0")}`;
  let dayKey = campusDateKey(referenceDate);
  if (closeMinutes <= openMinutes) {
    const clock = campusTimeParts(referenceDate);
    const nowMinutes = clock.hour * 60 + clock.minute;
    if (nowMinutes < closeMinutes) dayKey = addCalendarDays(dayKey, -1);
  }
  const closeKey = closeMinutes <= openMinutes ? addCalendarDays(dayKey, 1) : dayKey;
  return {
    open: atCampus(dayKey, openHhmm),
    close: atCampus(closeKey, closeHhmm),
  };
}

function serviceWindows(store, dateOrKey) {
  const periods = normalizeServicePeriods(store?.service_periods);
  if (!periods.length) {
    const date = dateOrKey instanceof Date ? dateOrKey : atCampus(dateOrKey, "12:00");
    const legacy = legacyServiceWindow(store, date);
    return legacy ? [legacy] : [];
  }
  const key = typeof dateOrKey === "string" ? dateOrKey : campusDateKey(dateOrKey);
  return SCHOOL_PICKUP_WINDOWS.map(([openValue, closeValue]) => ({
    open: atCampus(key, openValue),
    close: atCampus(key, closeValue),
  }));
}

function pickupDayAllowed(pickup, now) {
  const day = campusDateKey(pickup);
  const today = campusDateKey(now);
  return day === today || day === addCalendarDays(today, 1);
}

export function isPickupTimeAllowed(store, pickupTime, now = new Date()) {
  if (!store || store.status !== "open") return false;
  const pickup = new Date(pickupTime);
  if (Number.isNaN(pickup.getTime())) return false;
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  if (pickup < earliest || !pickupDayAllowed(pickup, now)) return false;
  const interval = normalizeServicePeriods(store.service_periods).length ? 5 : 15;
  const { minute, second } = campusTimeParts(pickup);
  if (minute % interval !== 0 || second !== 0) return false;

  return serviceWindows(store, pickup).some((window) => pickup >= window.open && pickup <= window.close);
}

export function pickupSlotsForStore(store, now = new Date()) {
  if (!store || store.status !== "open") return [];
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  const periods = normalizeServicePeriods(store.service_periods);
  const interval = periods.length ? 5 : 15;
  const byLabel = new Map();
  const today = campusDateKey(now);
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const key = addCalendarDays(today, dayOffset);
    const windows = serviceWindows(store, key);
    for (const window of windows) {
      const pickup = firstPickupInWindow(window.open, window.close, earliest, interval);
      if (!pickup) continue;
      const label = `${campusClock(window.open)}–${campusClock(window.close)}`;
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

/** Campus calendar date YYYY-MM-DD for daily order history. */
export function dateKey(iso) {
  return campusDateKeyFromIso(iso);
}

export function formatDate(iso) {
  const k = dateKey(iso);
  if (!k) return "—";
  const [y, m, d] = k.split("-");
  return `${Number(m)}/${Number(d)} (${y})`;
}
