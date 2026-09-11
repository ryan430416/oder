import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { t, storeLabel, statusLabel } from "../i18n.js";
import { runAdminPage } from "../admin-boot.js";
import { escapeHtml } from "../html.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

await runAdminPage(async () => {

const box = qs("#box");
const statusEl = qs("#analyticsStatus");

async function render() {
  box.innerHTML = `<div class="card skeleton" aria-hidden="true"></div>`;
  hideBackendNotice(statusEl);
  const statsResult = await api.getAdminStats();
  if (!statsResult?.ok || !statsResult.data) {
    box.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "analytics_load_failed",
      onRetry: () => render(),
    });
    return;
  }
  const stats = statsResult.data;
  const storesResult = await api.getStores();
  const stores = storesResult.ok ? storesResult.data || [] : [];
  const sname = (id) => {
    const s = stores.find((x) => x.store_id === id);
    return s ? storeLabel(s).name : id || "—";
  };
  const emptyToday = !stats.today;
  if (emptyToday && !stats.orders) {
    box.innerHTML = `<p class="empty">${t("analytics_empty")}</p>`;
    return;
  }
  const statusCounts = stats.statusCounts || {};
  const statusHtml = Object.keys(statusCounts).length
    ? Object.entries(statusCounts)
        .map(([status, count]) => `<li>${escapeHtml(statusLabel(status))}：${count}</li>`)
        .join("")
    : `<li>${escapeHtml(t("analytics_empty"))}</li>`;
  box.innerHTML = `
  <div class="stat-grid">
    <div class="card">${t("stat_today")}<strong>${stats.today}</strong></div>
    <div class="card">${t("stat_revenue")}<strong>${money(stats.revenue)}</strong></div>
    <div class="card">${t("stat_orders")}<strong>${stats.orders}</strong></div>
    <div class="card">${t("stat_stores")}<strong>${stats.stores}</strong></div>
    <div class="card">${t("stat_popular_store")}<strong>${escapeHtml(sname(stats.topStoreId))}</strong></div>
    <div class="card">${t("stat_popular_product")}<strong>${escapeHtml(stats.topProduct || "—")}</strong></div>
    <div class="card">${t("stat_products")}<strong>${stats.products}</strong></div>
  </div>
  <section class="card" style="margin-top:16px">
    <strong>${escapeHtml(t("status_dist"))}</strong>
    <ul class="item-list">${statusHtml}</ul>
  </section>
`;
}

render();
});
