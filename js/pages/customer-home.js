import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel } from "../i18n.js";

initI18n();
auth.ensureCustomer();
const session = auth.getSession();
qs("#who").textContent = t("who", { name: session.name });

qs("#cartCount").textContent = cart.count();
qs("#cartCount").hidden = cart.count() === 0;

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
      return `
    <a class="card store-card" href="store.html?store_id=${encodeURIComponent(s.store_id)}">
      <div class="store-emoji">${s.image || "🏪"}</div>
      <div>
        <strong>${lab.name}</strong>
        <div class="muted">${lab.desc}</div>
        <div class="muted">${s.open_time}–${s.close_time}</div>
      </div>
      <span class="badge ${isOpen(s) ? "" : "off"}">${isOpen(s) ? t("open") : t("closed")}</span>
    </a>`;
    })
    .join("");
  if (!rows.length) listEl.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
}

stores = await api.getStores();
render();
qs("#search").addEventListener("input", (e) => render(e.target.value.trim().toLowerCase()));
