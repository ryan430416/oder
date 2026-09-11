import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs } from "../nav.js";
import { t, statusLabel, productLabel, storeLabel, gradeLabel } from "../i18n.js";
import { runAdminPage } from "../admin-boot.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";
import { watchOrders } from "../order-filters.js";
import { campusDateKey } from "../campus-time.js";

await runAdminPage(async () => {

const list = qs("#list");
const day = qs("#day");
const statusEl = qs("#ordersStatus");
const liveEl = qs("#ordersLive");
let stores = [];
let cachedOrders = [];
let hasLoaded = false;
let loading = false;

function sname(id) {
  const s = stores.find((x) => x.store_id === id);
  return s ? `${storeLabel(s).name}` : id || "—";
}

function paintOrders(orders) {
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
      <div class="muted">${escapeHtml(t("created_at_label", { time: formatTime(o.created_at) }))}</div>
      <ul class="item-list">${(o.items || [])
        .map(
          (i) =>
            `<li>${escapeHtml(productLabel(i.product_id, i.product_name))} × ${i.quantity}　${money(
              (i.unit_price || 0) * (i.quantity || 0)
            )}</li>`
        )
        .join("")}</ul>
      <div><strong>${escapeHtml(t("total"))} ${money(o.total)}</strong></div>
      ${can ? `<div class="row-actions"><button class="btn btn-danger" type="button" data-cancel="${escapeAttr(o.order_id)}">${escapeHtml(t("cancel_order"))}</button></div>` : ""}
    </article>`;
  });
  list.innerHTML = html;
}

async function render({ keepOnError = true } = {}) {
  if (loading) return;
  loading = true;
  if (!hasLoaded) list.innerHTML = `<div class="card skeleton" aria-hidden="true"></div>`;
  hideBackendNotice(statusEl);
  try {
    const storesResult = await api.getStores();
    if (storesResult.ok) stores = storesResult.data || [];
    const result = await api.getAdminOrders();
    if (!result?.ok) {
      if (!keepOnError || !hasLoaded) {
        list.innerHTML = "";
        cachedOrders = [];
      }
      renderBackendNotice(statusEl, {
        code: "orders_load_failed",
        onRetry: () => render({ keepOnError: false }),
      });
      return;
    }
    cachedOrders = result.data || [];
    hasLoaded = true;
    let orders = cachedOrders;
    if (day.value) orders = orders.filter((o) => dateKey(o.created_at) === day.value);
    paintOrders(orders);
  } catch (error) {
    console.error("admin orders render failed", error?.message || error);
    if (!keepOnError || !hasLoaded) list.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "orders_load_failed",
      onRetry: () => render({ keepOnError: false }),
    });
  } finally {
    loading = false;
  }
}

day.addEventListener("change", () => {
  if (!hasLoaded) {
    render();
    return;
  }
  let orders = cachedOrders;
  if (day.value) orders = orders.filter((o) => dateKey(o.created_at) === day.value);
  paintOrders(orders);
});

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel]");
  if (!btn) return;
  if (!confirm(t("cancel_confirm"))) return;
  const res = await api.cancelOrder(btn.dataset.cancel);
  if (!res.ok) alert(t(res.code || "cannot_cancel"));
  render({ keepOnError: true });
});

watchOrders(
  () => render({ keepOnError: true }),
  (state) => {
    if (!liveEl) return;
    liveEl.textContent = t(
      state === "connected"
        ? "realtime_connected"
        : state === "connecting"
          ? "realtime_connecting"
          : "realtime_reconnecting"
    );
  }
);

// Default: show all orders (empty date). Bangkok “today” can be selected manually.
day.value = "";
day.setAttribute("max", campusDateKey());
render({ keepOnError: false });
});
