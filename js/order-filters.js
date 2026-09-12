import { getPocketBase } from "./pocketbase.js";
import { escapeAttr, escapeHtml } from "./html.js";

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

export function filterTabButton({ id, label, pressed, attr = "data-f" }) {
  const on = pressed ? "on" : "";
  return `<button type="button" ${attr}="${escapeAttr(id)}" class="${on}" aria-pressed="${pressed ? "true" : "false"}">${escapeHtml(label)}</button>`;
}

export function watchOrders(onChange, onStatus = () => {}) {
  const run = () => onChange();
  let client;
  let active = true;
  let retryTimer;
  let subscribed = false;

  const connect = async () => {
    try {
      client = client || (await getPocketBase());
      if (!active) return;
      onStatus("connecting");
      await client.collection("orders").subscribe("*", run);
      if (!active) {
        await client.collection("orders").unsubscribe("*");
        return;
      }
      subscribed = true;
      onStatus("connected");
    } catch (error) {
      console.error("PocketBase Realtime connection failed", error);
      onStatus("reconnecting");
      retryTimer = setTimeout(connect, 3000);
    }
  };

  connect();
  const cleanup = () => {
    active = false;
    clearTimeout(retryTimer);
    if (subscribed) client?.collection("orders").unsubscribe("*");
  };
  window.addEventListener("beforeunload", cleanup, { once: true });
  return cleanup;
}
