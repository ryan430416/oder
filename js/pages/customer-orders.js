import { auth } from "../auth.js";
import { api } from "../api.js";
import { money, formatTime, dateKey, formatDate } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, statusLabel, productLabel, gradeLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { ORDER_FILTERS, filterTabButton, watchOrders } from "../order-filters.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { canCustomerCancel } from "../order-status.js";
import { createInflight, fetchListPhase } from "../ui-state.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";
import { shouldQueryCustomerData } from "../guest-session.js";

initI18n();

const tabs = qs("#tabs");
const list = qs("#list");
const day = qs("#day");
const statusEl = qs("#ordersStatus");
const gate = createInflight();
let session = null;
let realtimeStarted = false;
let filter = "all";
let cachedOrders = [];
let hasLoaded = false;
let loading = false;
let liveState = "connecting";

const realtimeStatus = qs("#ordersLive") || document.createElement("p");
realtimeStatus.className = "muted realtime-status";
if (!realtimeStatus.id) {
  realtimeStatus.id = "ordersLive";
  tabs.before(realtimeStatus);
}

const createdOrder = new URLSearchParams(location.search).get("created");
if (createdOrder) {
  const notice = document.createElement("p");
  notice.className = "notice";
  notice.textContent = t("order_created", { id: createdOrder });
  tabs.before(notice);
  history.replaceState(null, "", location.pathname);
}

function match(o) {
  if (day.value && dateKey(o.created_at) !== day.value) return false;
  const f = ORDER_FILTERS.find((x) => x.id === filter) || ORDER_FILTERS[0];
  return f.match(o.status);
}

function timeline(status) {
  const steps = ["pending", "accepted", "preparing", "ready", "completed"];
  const current = steps.indexOf(status);
  if (current < 0) return "";
  return `<ol class="order-timeline">${steps
    .map(
      (step, index) =>
        `<li class="${index <= current ? "done" : ""}" aria-current="${step === status ? "step" : "false"}">${escapeHtml(statusLabel(step))}</li>`
    )
    .join("")}</ol>`;
}

function drawTabs() {
  tabs.innerHTML = ORDER_FILTERS.map((f) =>
    filterTabButton({ id: f.id, label: t(f.key), pressed: f.id === filter })
  ).join("");
}

function showOrdersLoading() {
  list.setAttribute("aria-busy", "true");
  list.innerHTML = `
    <p class="empty">${escapeHtml(t("orders_loading"))}</p>
    <div class="card skeleton" aria-hidden="true"></div>
    <div class="card skeleton" aria-hidden="true"></div>
  `;
}

function paintOrders(rows) {
  list.removeAttribute("aria-busy");
  if (!rows.length) {
    list.innerHTML = `<p class="empty">${escapeHtml(t("no_orders"))}</p>`;
    return;
  }
  let html = "";
  let lastDay = "";
  rows.forEach((o) => {
    const dk = dateKey(o.created_at);
    if (dk !== lastDay) {
      html += `<h3 class="page-title">${escapeHtml(formatDate(o.created_at))}</h3>`;
      lastDay = dk;
    }
    html += `
    <article class="card order-card" data-oid="${escapeAttr(o.order_id)}">
      <div class="order-meta">
        <strong>${escapeHtml(o.order_number || o.order_id)}</strong>
        <span class="status ${escapeAttr(o.status)}">${escapeHtml(statusLabel(o.status))}</span>
      </div>
      <div class="muted">${escapeHtml(t("cust_label", { name: o.customer_name || session.name }))}</div>
      <div class="muted">${escapeHtml(t("grade_label", { grade: gradeLabel(o.customer_grade || session.grade) }))}</div>
      <div class="muted">${escapeHtml(t("pickup_at", { time: formatTime(o.pickup_time), amount: money(o.total) }))}</div>
      ${timeline(o.status)}
      <ul class="item-list">${(o.items || []).map((i) => `<li>${escapeHtml(productLabel(i.product_id, i.product_name))} × ${i.quantity}</li>`).join("")}</ul>
      ${canCustomerCancel(o.status) ? `<div class="row-actions"><button class="btn btn-danger" type="button" data-cancel="${escapeAttr(o.order_id)}">${escapeHtml(t("cancel_order"))}</button></div>` : ""}
    </article>`;
  });
  list.innerHTML = html;
}

function paintFromCache() {
  paintOrders(cachedOrders.filter(match));
}

async function render({ keepOnError = true } = {}) {
  if (!session) {
    list.innerHTML = "";
    list.removeAttribute("aria-busy");
    return;
  }
  if (loading) return;
  loading = true;
  const phase = fetchListPhase({ loading: true, loaded: hasLoaded, count: cachedOrders.length });
  if (phase === "loading") showOrdersLoading();
  hideBackendNotice(statusEl);
  try {
    const result = await api.getCustomerOrders();
    if (!result?.ok) {
      if (!keepOnError || !hasLoaded) {
        cachedOrders = [];
        hasLoaded = false;
        list.innerHTML = "";
        list.removeAttribute("aria-busy");
      }
      renderBackendNotice(statusEl, {
        code: result?.code === "session_expired" ? "session_expired" : "orders_load_failed",
        onRetry: () => render({ keepOnError: false }),
      });
      return;
    }
    cachedOrders = result.data || [];
    hasLoaded = true;
    paintFromCache();
  } catch {
    if (!keepOnError || !hasLoaded) {
      list.innerHTML = "";
      list.removeAttribute("aria-busy");
    }
    renderBackendNotice(statusEl, {
      code: "orders_load_failed",
      onRetry: () => render({ keepOnError: false }),
    });
  } finally {
    loading = false;
  }
}

async function boot() {
  const run = await gate.run(async () => {
    showOrdersLoading();
    hideBackendNotice(statusEl);
    const result = await auth.ensureCustomer();
    if (!shouldQueryCustomerData(result)) {
      session = null;
      hasLoaded = false;
      list.innerHTML = "";
      list.removeAttribute("aria-busy");
      renderBackendNotice(statusEl, {
        code: result?.code || "anonymous_login_failed",
        busy: gate.busy,
        onRetry: () => boot(),
      });
      return;
    }
    session = result.session;
    hideBackendNotice(statusEl);
    mountBell(qs("#bellHost"), "notifications.html");
    drawTabs();
    await render({ keepOnError: false });
    if (!realtimeStarted) {
      realtimeStarted = true;
      watchOrders(
        () => render({ keepOnError: true }),
        (status) => {
          liveState = status;
          realtimeStatus.hidden = false;
          realtimeStatus.textContent = t(`realtime_${status}`);
        }
      );
      setInterval(() => {
        if (liveState === "connected" || !session) return;
        render({ keepOnError: true });
      }, 8000);
    }
  });
  if (run?.skipped) return;
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-f]");
  if (!btn || !session || !hasLoaded) return;
  filter = btn.dataset.f;
  drawTabs();
  paintFromCache();
});

day.addEventListener("change", () => {
  if (session && hasLoaded) paintFromCache();
});

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cancel]");
  if (!btn || !session) return;
  if (!confirm(t("cancel_confirm"))) return;
  const res = await api.cancelOrder(btn.dataset.cancel);
  if (!res.ok) alert(t(res.code || "cannot_cancel"));
  render({ keepOnError: true });
});

boot();
