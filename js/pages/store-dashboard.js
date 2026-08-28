import { auth } from "../auth.js";
import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs, goToPage } from "../nav.js";
import { initI18n, t, statusLabel, productLabel, gradeLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { ORDER_FILTERS, watchOrders } from "../order-filters.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { canTransition } from "../order-status.js";

initI18n();
const session = await auth.requireRole("store", "index.html");
if (!session) throw new Error("store");

qs("#title").textContent = session.name;
qs("#bound").textContent = t("bound", { id: auth.getBoundStoreId() });
qs("#logout").addEventListener("click", async () => {
  await auth.logout();
  goToPage("index.html");
});
mountBell(qs("#bellHost"), "notifications.html");

let group = "all";

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
const realtimeStatus = document.createElement("p");
realtimeStatus.className = "muted realtime-status";
tabs.before(realtimeStatus);

function drawTabs() {
  tabs.innerHTML = ORDER_FILTERS.map(
    (g) => `<button type="button" data-g="${g.id}" class="${g.id === group ? "on" : ""}">${t(g.key)}</button>`
  ).join("");
}

async function render() {
  const orders = await api.getStoreOrders();
  const g = ORDER_FILTERS.find((x) => x.id === group) || ORDER_FILTERS[0];
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
    <article class="card order-card" data-oid="${escapeAttr(o.order_id)}" data-status="${escapeAttr(o.status)}">
      <div class="order-meta">
        <strong>${escapeHtml(o.order_number || o.order_id)}</strong>
        <span class="status ${escapeAttr(o.status)}">${escapeHtml(statusLabel(o.status))}</span>
      </div>
      <div class="muted">${escapeHtml(t("cust_label", { name: o.customer_name || "—" }))}</div>
      <div class="muted">${escapeHtml(t("grade_label", { grade: gradeLabel(o.customer_grade) }))}</div>
      <div class="muted">${escapeHtml(t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) }))}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${escapeHtml(productLabel(i.product_id, i.product_name))} × ${i.quantity}</li>`).join("")}</ul>
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
  const currentStatus = card
    .querySelector(".status")
    ?.className.match(/\b(pending|accepted|preparing|ready|completed|rejected|cancelled)\b/)?.[1];
  if (!canTransition(currentStatus, btn.dataset.next)) return;
  btn.disabled = true;
  const res = await api.updateOrderStatus(card.dataset.oid, btn.dataset.next);
  if (!res.ok) {
    btn.disabled = false;
    alert(res.message || t("order_fail"));
  }
  render();
});

drawTabs();
render();
watchOrders(render, (status) => {
  realtimeStatus.textContent = t(`realtime_${status}`);
});
setInterval(render, 5000);
