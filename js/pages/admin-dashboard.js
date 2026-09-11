import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { mountBell } from "../notify-ui.js";
import { dashboardOnboardingTip } from "../admin-data.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

if (!(await bootAdmin())) throw new Error("admin");
mountBell(qs("#bellHost"), "notifications.html");

const tipEl = qs("#adminTip");
const statusEl = qs("#dashStatus");

async function render() {
  qs("#stats").innerHTML = `<div class="card skeleton" aria-hidden="true"></div>`;
  tipEl.textContent = "";
  hideBackendNotice(statusEl);
  const statsResult = await api.getAdminStats();
  if (!statsResult?.ok || !statsResult.data) {
    qs("#stats").innerHTML = "";
    tipEl.textContent = "";
    renderBackendNotice(statusEl, {
      code: "backend_error",
      onRetry: () => render(),
    });
    return;
  }
  const stats = statsResult.data;
  qs("#stats").innerHTML = `
  <div class="card">${t("stat_stores")}<strong>${stats.stores}</strong></div>
  <div class="card">${t("stat_products")}<strong>${stats.products}</strong></div>
  <div class="card">${t("stat_orders")}<strong>${stats.orders}</strong></div>
  <div class="card">${t("stat_today")}<strong>${stats.today}</strong></div>
`;
  const tip = dashboardOnboardingTip({
    stores: stats.stores,
    products: stats.products,
    loading: false,
    error: false,
  });
  if (tip) {
    tipEl.textContent = t(tip);
  } else {
    tipEl.textContent = t("admin_ops_summary", {
      stores: stats.stores,
      products: stats.products,
      orders: stats.orders,
      today: stats.today,
    });
  }
}

render();
