import { config } from "./config.js";

/** 顧客／店家共用同一組狀態分頁 */
export const ORDER_FILTERS = [
  { id: "all", key: "filter_all", match: () => true },
  { id: "pending", key: "status_pending", match: (s) => s === "pending" },
  { id: "accepted", key: "status_accepted", match: (s) => s === "accepted" },
  { id: "preparing", key: "status_preparing", match: (s) => s === "preparing" },
  { id: "ready", key: "status_ready", match: (s) => s === "ready" },
  { id: "completed", key: "status_completed", match: (s) => s === "completed" },
  { id: "cancelled", key: "status_cancelled", match: (s) => s === "cancelled" || s === "rejected" },
];

export function watchOrders(onChange) {
  const run = () => onChange();
  window.addEventListener("storage", (e) => {
    if (e.key === config.MOCK_DB_KEY) run();
  });
  try {
    const ch = new BroadcastChannel("campus_order_db");
    ch.onmessage = run;
  } catch {
    /* ignore */
  }
}
