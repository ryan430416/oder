import { config } from "./config.js";
import { getSupabase, isSupabaseEnabled } from "./supabase.js";

/** 顧客／店家共用同一組狀態分頁 */
export const ORDER_FILTERS = [
  { id: "all", key: "filter_all", match: () => true },
  { id: "pending", key: "status_pending", match: (s) => s === "pending" },
  { id: "ready", key: "status_ready", match: (s) => s === "ready" },
  { id: "completed", key: "status_completed", match: (s) => s === "completed" },
  { id: "cancelled", key: "status_cancelled", match: (s) => s === "cancelled" || s === "rejected" },
];

export function watchOrders(onChange) {
  const run = () => onChange();
  if (isSupabaseEnabled()) {
    let channel;
    let active = true;
    getSupabase()
      .then((client) => {
        if (!active) return;
        channel = client
          .channel(`orders-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, run)
          .subscribe();
      })
      .catch((error) => console.error("Supabase Realtime connection failed", error));
    const cleanup = () => {
      active = false;
      if (channel) channel.unsubscribe();
    };
    window.addEventListener("beforeunload", cleanup, { once: true });
    return cleanup;
  }
  const onStorage = (e) => {
    if (e.key === config.MOCK_DB_KEY) run();
  };
  window.addEventListener("storage", onStorage);
  let ch;
  try {
    ch = new BroadcastChannel("campus_order_db");
    ch.onmessage = run;
  } catch {
    /* ignore */
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    if (ch) ch.close();
  };
}
