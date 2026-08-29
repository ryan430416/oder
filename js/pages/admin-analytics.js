import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { t, storeLabel } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { escapeHtml } from "../html.js";

if (!(await bootAdmin())) throw new Error("admin");

const stats = await api.getAdminStats();
if (!stats) {
  location.href = "index.html";
  throw new Error("admin session expired");
}
const storesResult = await api.getStores();
const stores = storesResult.ok ? storesResult.data || [] : [];
const sname = (id) => {
  const s = stores.find((x) => x.store_id === id);
  return s ? storeLabel(s).name : id || "—";
};

qs("#box").innerHTML = `
  <div class="stat-grid">
    <div class="card">${t("stat_today")}<strong>${stats.today}</strong></div>
    <div class="card">${t("stat_orders")}<strong>${stats.orders}</strong></div>
    <div class="card">${t("stat_revenue")}<strong>${money(stats.revenue)}</strong></div>
    <div class="card">${t("stat_stores")}<strong>${stats.stores}</strong></div>
    <div class="card">${t("stat_popular_store")}<strong>${escapeHtml(sname(stats.topStoreId))}</strong></div>
    <div class="card">${t("stat_popular_product")}<strong>${escapeHtml(stats.topProduct || "—")}</strong></div>
    <div class="card">${t("stat_peak")}<strong>${stats.peakHour == null ? "—" : String(stats.peakHour).padStart(2, "0")}:00</strong></div>
    <div class="card">${t("stat_products")}<strong>${stats.products}</strong></div>
  </div>
`;
