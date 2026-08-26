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

export function todaySlots() {
  const now = new Date();
  const slots = [];
  const start = new Date(now);
  start.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  start.setMinutes(start.getMinutes() + 15);
  for (let i = 0; i < 16; i++) {
    const t = new Date(start.getTime() + i * 15 * 60 * 1000);
    const p = (x) => String(x).padStart(2, "0");
    slots.push({
      value: t.toISOString(),
      label: `${p(t.getHours())}:${p(t.getMinutes())}`,
    });
  }
  return slots;
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
