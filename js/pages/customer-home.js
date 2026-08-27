import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { escapeHtml } from "../html.js";
import { servicePeriodsLabel } from "../service-periods.js";

initI18n();
const session = auth.ensureCustomer();
qs("#who").textContent = t("who", { name: session.name });
qs("#custName").value = session.name === "學生小明" ? "" : session.name;
qs("#custGrade").value = session.grade || "";
qs("#cartCount").textContent = cart.count();
qs("#cartCount").hidden = cart.count() === 0;
mountBell(qs("#bellHost"), "notifications.html");

qs("#saveName").addEventListener("click", async () => {
  const res = auth.setCustomerProfile(qs("#custName").value, qs("#custGrade").value);
  if (!res.ok) {
    qs("#nameMsg").textContent = t(res.code);
    return;
  }
  const saved = await api.updateCustomerProfile(res.session.name, res.session.grade);
  qs("#nameMsg").textContent = saved.ok ? t("profile_saved") : t(saved.code || "backend_error");
  if (saved.ok) qs("#who").textContent = t("who", { name: res.session.name });
});

const listEl = qs("#list");
let stores = [];

function isOpen(s) {
  return s.status === "open";
}

function matches(s, filter) {
  if (!filter) return true;
  const lab = storeLabel(s);
  return (
    s.store_name.toLowerCase().includes(filter) ||
    lab.name.toLowerCase().includes(filter) ||
    s.store_id.toLowerCase().includes(filter)
  );
}

function render(filter = "") {
  const rows = stores.filter((s) => matches(s, filter));
  listEl.innerHTML = rows
    .map((s) => {
      const lab = storeLabel(s);
      const open = isOpen(s);
      const tag = open ? "a" : "article";
      const link = open
        ? ` href="store.html?store_id=${encodeURIComponent(s.store_id)}"`
        : ` aria-disabled="true"`;
      return `
    <${tag} class="card store-card ${open ? "" : "is-closed"}"${link}>
      <div class="store-emoji">${escapeHtml(s.image || "🏪")}</div>
      <div>
        <strong>${escapeHtml(lab.name)}</strong>
        <div class="muted">${escapeHtml(lab.desc)}</div>
        <div class="muted">${escapeHtml(servicePeriodsLabel(s.service_periods))}</div>
      </div>
      <span class="badge ${open ? "" : "off"}">${escapeHtml(open ? t("open") : t("closed"))}</span>
    </${tag}>`;
    })
    .join("");
  if (!rows.length) listEl.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
}

stores = await api.getStores();
render();
qs("#search").addEventListener("input", (e) => render(e.target.value.trim().toLowerCase()));
