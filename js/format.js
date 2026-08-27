/** 金額、時間、訂單狀態顯示 */

export const STATUS_LABEL = {
  pending: "待店家接單",
  accepted: "店家已接單",
  preparing: "製作中",
  ready: "可取餐",
  completed: "已完成",
  cancelled: "已取消",
  rejected: "店家拒絕",
};

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

function serviceWindow(store, now) {
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

export function isPickupTimeAllowed(store, pickupTime, now = new Date()) {
  if (!store || store.status !== "open") return false;
  const pickup = new Date(pickupTime);
  if (Number.isNaN(pickup.getTime())) return false;
  const earliest = new Date(now.getTime() + 15 * 60 * 1000);
  if (pickup < earliest || pickup > new Date(now.getTime() + 24 * 60 * 60 * 1000)) return false;
  if (pickup.getMinutes() % 15 !== 0 || pickup.getSeconds() !== 0) return false;

  const window = serviceWindow(store, pickup);
  return Boolean(window && pickup >= window.open && pickup < window.close);
}

export function pickupSlotsForStore(store, now = new Date()) {
  if (!store || store.status !== "open") return [];
  const window = serviceWindow(store, now);
  if (!window) return [];
  const slots = [];
  const earliest = new Date(Math.max(now.getTime() + 15 * 60 * 1000, window.open.getTime()));
  earliest.setSeconds(0, 0);
  earliest.setMinutes(Math.ceil(earliest.getMinutes() / 15) * 15);

  for (let t = earliest; t < window.close && slots.length < 16; t = new Date(t.getTime() + 15 * 60 * 1000)) {
    const p = (x) => String(x).padStart(2, "0");
    slots.push({
      value: t.toISOString(),
      label: `${p(t.getHours())}:${p(t.getMinutes())}`,
    });
  }
  return slots;
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
