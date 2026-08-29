import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs } from "../nav.js";
import { t, statusLabel, productLabel, storeLabel, gradeLabel } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { escapeAttr, escapeHtml } from "../html.js";

if (!(await bootAdmin())) throw new Error("admin");

const storesResult = await api.getStores();
const stores = storesResult.ok ? storesResult.data || [] : [];
const list = qs("#list");
const day = qs("#day");

function sname(id) {
  const s = stores.find((x) => x.store_id === id);
  return s ? `${storeLabel(s).name} (${id})` : id;
}

async function render() {
  let orders = await api.getAdminOrders();
  if (day.value) orders = orders.filter((o) => dateKey(o.created_at) === day.value);
  if (!orders.length) {
    list.innerHTML = `<p class="empty">${t("no_orders")}</p>`;
    return;
  }
  let html = "";
  let last = "";
  orders.forEach((o) => {
    const dk = dateKey(o.created_at);
    if (dk !== last) {
      html += `<h3 class="page-title">${formatDate(o.created_at)}</h3>`;
      last = dk;
    }
    const can = !["completed", "cancelled", "rejected"].includes(o.status);
    html += `
    <article class="card order-card" data-oid="${escapeAttr(o.order_id)}">
      <div class="order-meta">
        <strong>${escapeHtml(o.order_number || o.order_id)}</strong>
        <span class="status ${escapeAttr(o.status)}">${escapeHtml(statusLabel(o.status))}</span>
      </div>
      <div class="muted">${escapeHtml(sname(o.store_id))}</div>
      <div class="muted">${escapeHtml(t("cust_label", { name: o.customer_name || "—" }))}</div>
      <div class="muted">${escapeHtml(t("grade_label", { grade: gradeLabel(o.customer_grade) }))}</div>
      <div class="muted">${escapeHtml(t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) }))}</div>
      <ul class="item-list">${(o.items || [])
        .map((i) => `<li>${escapeHtml(productLabel(i.product_id, i.product_name))} × ${i.quantity}</li>`)
        .join("")}</ul>
      ${can ? `<div class="row-actions"><button class="btn btn-danger" type="button" data-cancel="${escapeAttr(o.order_id)}">${escapeHtml(t("cancel_order"))}</button></div>` : ""}
    </article>`;
  });
  list.innerHTML = html;
}

day.addEventListener("change", render);
list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel]");
  if (!btn) return;
  if (!confirm(t("cancel_confirm"))) return;
  const res = await api.cancelOrder(btn.dataset.cancel);
  if (!res.ok) alert(t(res.code || "cannot_cancel"));
  render();
});

render();
setInterval(render, 5000);
