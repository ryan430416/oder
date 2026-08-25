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
