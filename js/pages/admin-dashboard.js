import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { mountBell } from "../notify-ui.js";

if (!bootAdmin()) throw new Error("admin");
mountBell(qs("#bellHost"), "notifications.html");

const stats = await api.getAdminStats();
if (!stats) {
  location.href = "index.html";
  throw new Error("admin session expired");
}
qs("#stats").innerHTML = `
  <div class="card">${t("stat_stores")}<strong>${stats.stores}</strong></div>
  <div class="card">${t("stat_products")}<strong>${stats.products}</strong></div>
  <div class="card">${t("stat_orders")}<strong>${stats.orders}</strong></div>
  <div class="card">${t("stat_today")}<strong>${stats.today}</strong></div>
`;
