import { auth } from "../auth.js";
import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, statusLabel, productLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";

initI18n();
const session = auth.requireRole("store", "index.html");

qs("#title").textContent = session.name;
qs("#bound").textContent = t("bound", { id: auth.getBoundStoreId() });
qs("#logout").addEventListener("click", () => {
  auth.logout();
  location.href = "index.html";
});
mountBell(qs("#bellHost"), "notifications.html");

const GROUPS = [
  { id: "new", key: "group_new", match: (s) => s === "pending" },
  { id: "cook", key: "group_cook", match: (s) => s === "accepted" || s === "preparing" },
  { id: "wait", key: "group_wait", match: (s) => s === "ready" },
  { id: "done", key: "group_done", match: (s) => ["completed", "rejected", "cancelled"].includes(s) },
];
let group = "new";

function actions(status) {
  let html = "";
  if (status === "pending") {
    html += `<button class="btn" data-next="accepted">${t("accept")}</button>
            <button class="btn btn-danger" data-next="rejected">${t("reject")}</button>`;
  }
  if (status === "accepted") {
    html += `<button class="btn" data-next="preparing">${t("start_cook")}</button>`;
  }
  if (status === "preparing") {
    html += `<button class="btn" data-next="ready">${t("mark_ready")}</button>`;
  }
  if (status === "ready") {
    html += `<button class="btn" data-next="completed">${t("complete")}</button>`;
  }
  if (!["completed", "cancelled", "rejected"].includes(status)) {
    html += `<button class="btn btn-ghost" data-cancel="1">${t("cancel_order")}</button>`;
  }
  return html;
}

const tabs = qs("#tabs");
const list = qs("#list");
const day = qs("#day");

function drawTabs() {
  tabs.innerHTML = GROUPS.map(
    (g) => `<button type="button" data-g="${g.id}" class="${g.id === group ? "on" : ""}">${t(g.key)}</button>`
  ).join("");
}

async function render() {
  const orders = await api.getStoreOrders();
  const g = GROUPS.find((x) => x.id === group);
  let rows = orders.filter((o) => g.match(o.status));
  if (day.value) rows = rows.filter((o) => dateKey(o.created_at) === day.value);
  if (!rows.length) {
    list.innerHTML = `<p class="empty">${t("no_store_orders")}</p>`;
    return;
  }
  let html = "";
  let last = "";
  rows.forEach((o) => {
    const dk = dateKey(o.created_at);
    if (dk !== last) {
      html += `<h3 class="page-title">${formatDate(o.created_at)}</h3>`;
      last = dk;
    }
    html += `
    <article class="card order-card" data-oid="${o.order_id}">
      <div class="order-meta">
        <strong>${o.order_id}</strong>
        <span class="status ${o.status}">${statusLabel(o.status)}</span>
      </div>
      <div class="muted">${t("cust_label", { name: o.customer_name || "—" })}</div>
      <div class="muted">${t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) })}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${productLabel(i.product_id, i.product_name)} × ${i.quantity}</li>`).join("")}</ul>
      <div class="row-actions">${actions(o.status)}</div>
    </article>`;
  });
  list.innerHTML = html;
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-g]");
  if (!btn) return;
  group = btn.dataset.g;
  drawTabs();
  render();
});

day.addEventListener("change", render);

list.addEventListener("click", async (e) => {
  const cancel = e.target.closest("[data-cancel]");
  const btn = e.target.closest("[data-next]");
  const card = e.target.closest("[data-oid]");
  if (!card) return;
  if (cancel) {
    if (!confirm(t("cancel_confirm"))) return;
    const res = await api.cancelOrder(card.dataset.oid);
    if (!res.ok) alert(t(res.code || "cannot_cancel"));
    render();
    return;
  }
  if (!btn) return;
  const res = await api.updateOrderStatus(card.dataset.oid, btn.dataset.next);
  if (!res.ok) alert(res.message || t("order_fail"));
  render();
});

drawTabs();
render();
setInterval(render, 20000);
