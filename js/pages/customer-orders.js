import { auth } from "../auth.js";
import { api } from "../api.js";
import { money, formatTime } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, statusLabel, productLabel } from "../i18n.js";

initI18n();
const session = auth.ensureCustomer();
const FILTERS = [
  { id: "all", key: "filter_all" },
  { id: "pending", key: "filter_pending" },
  { id: "preparing", key: "filter_preparing" },
  { id: "ready", key: "filter_ready" },
  { id: "completed", key: "filter_completed" },
];
let filter = "all";
const tabs = qs("#tabs");
const list = qs("#list");

function match(o) {
  if (filter === "all") return true;
  if (filter === "preparing") return o.status === "accepted" || o.status === "preparing";
  return o.status === filter;
}

function drawTabs() {
  tabs.innerHTML = FILTERS.map(
    (f) => `<button type="button" data-f="${f.id}" class="${f.id === filter ? "on" : ""}">${t(f.key)}</button>`
  ).join("");
}

async function render() {
  const orders = await api.getCustomerOrders(session.user_id);
  const rows = orders.filter(match);
  if (!rows.length) {
    list.innerHTML = `<p class="empty">${t("no_orders")}</p>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (o) => `
    <article class="card order-card">
      <div class="order-meta">
        <strong>${o.order_id}</strong>
        <span class="status ${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="muted">${t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) })}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${productLabel(i.product_id, i.product_name)} × ${i.quantity}</li>`).join("")}</ul>
    </article>`
    )
    .join("");
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-f]");
  if (!btn) return;
  filter = btn.dataset.f;
  drawTabs();
  render();
});

drawTabs();
render();
