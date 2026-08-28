import { getSupabase } from "./supabase.js";

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

export function watchOrders(onChange, onStatus = () => {}) {
  const run = () => onChange();
  let channel;
  let client;
  let active = true;
  let retryTimer;

  const connect = async () => {
    try {
      client = client || (await getSupabase());
      if (!active) return;
      onStatus("connecting");
      channel = client
        .channel(`orders-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, run)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") onStatus("connected");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onStatus("reconnecting");
            channel?.unsubscribe();
            retryTimer = setTimeout(connect, 3000);
          }
          if (status === "CLOSED" && active) onStatus("disconnected");
        });
    } catch (error) {
      console.error("Supabase Realtime connection failed", error);
      onStatus("reconnecting");
      retryTimer = setTimeout(connect, 3000);
    }
  };

  connect();
  const cleanup = () => {
    active = false;
    clearTimeout(retryTimer);
    channel?.unsubscribe();
  };
  window.addEventListener("beforeunload", cleanup, { once: true });
  return cleanup;
}
