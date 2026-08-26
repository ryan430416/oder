import { auth } from "../auth.js";
import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, statusLabel, productLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";

initI18n();
const session = auth.ensureCustomer();
mountBell(qs("#bellHost"), "notifications.html");

const FILTERS = [
  { id: "all", key: "filter_all" },
  { id: "pending", key: "filter_pending" },
  { id: "preparing", key: "filter_preparing" },
  { id: "ready", key: "filter_ready" },
  { id: "completed", key: "filter_completed" },
  { id: "cancelled", key: "status_cancelled" },
];
let filter = "all";
const tabs = qs("#tabs");
const list = qs("#list");
const day = qs("#day");

function match(o) {
  if (day.value && dateKey(o.created_at) !== day.value) return false;
  if (filter === "all") return true;
  if (filter === "preparing") return o.status === "accepted" || o.status === "preparing";
  return o.status === filter;
}

function canCancel(o) {
  return o.status === "pending" || o.status === "accepted";
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
  let html = "";
  let lastDay = "";
  rows.forEach((o) => {
    const dk = dateKey(o.created_at);
    if (dk !== lastDay) {
      html += `<h3 class="page-title">${formatDate(o.created_at)}</h3>`;
      lastDay = dk;
    }
    html += `
    <article class="card order-card" data-oid="${o.order_id}">
      <div class="order-meta">
        <strong>${o.order_id}</strong>
        <span class="status ${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="muted">${t("cust_label", { name: o.customer_name || session.name })}</div>
      <div class="muted">${t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) })}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${productLabel(i.product_id, i.product_name)} × ${i.quantity}</li>`).join("")}</ul>
      ${canCancel(o) ? `<div class="row-actions"><button class="btn btn-danger" type="button" data-cancel="${o.order_id}">${t("cancel_order")}</button></div>` : ""}
    </article>`;
  });
  list.innerHTML = html;
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-f]");
  if (!btn) return;
  filter = btn.dataset.f;
  drawTabs();
  render();
});

day.addEventListener("change", render);

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel]");
  if (!btn) return;
  if (!confirm(t("cancel_confirm"))) return;
  const res = await api.cancelOrder(btn.dataset.cancel);
  if (!res.ok) alert(t(res.code || "cannot_cancel"));
  render();
});

drawTabs();
render();
