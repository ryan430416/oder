import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { qs } from "../nav.js";

auth.ensureCustomer();
const who = qs("#who");
const session = auth.getSession();
who.textContent = `目前身分：${session.name}`;

qs("#cartCount").textContent = cart.count();
qs("#cartCount").hidden = cart.count() === 0;

const listEl = qs("#list");
let stores = [];

function isOpen(s) {
  return s.status === "open";
}

function render(filter = "") {
  const rows = stores.filter((s) => s.store_name.toLowerCase().includes(filter));
  listEl.innerHTML = rows
    .map(
      (s) => `
    <a class="card store-card" href="store.html?store_id=${encodeURIComponent(s.store_id)}">
      <div class="store-emoji">${s.image || "🏪"}</div>
      <div>
        <strong>${s.store_name}</strong>
        <div class="muted">${s.description}</div>
        <div class="muted">${s.open_time}–${s.close_time}</div>
      </div>
      <span class="badge ${isOpen(s) ? "" : "off"}">${isOpen(s) ? "營業中" : "休息"}</span>
    </a>`
    )
    .join("");
  if (!rows.length) listEl.innerHTML = `<p class="empty">沒有符合的店家</p>`;
}

stores = await api.getStores();
render();
qs("#search").addEventListener("input", (e) => render(e.target.value.trim().toLowerCase()));
