import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel, productDesc, categoryLabel } from "../i18n.js";

initI18n();
auth.ensureCustomer();

const params = new URLSearchParams(location.search);
const storeId = params.get("store_id") || "";
const store = await api.getStore(storeId);
if (!store) {
  location.href = "index.html";
}

const lab = storeLabel(store);
qs("#storeName").textContent = lab.name;
qs("#storeDesc").textContent = `${lab.desc} · ${store.open_time}–${store.close_time}`;

function refreshBadge() {
  const n = cart.count();
  qs("#cartCount").textContent = n;
  qs("#cartCount").hidden = n === 0;
}
refreshBadge();

const products = await api.getProducts(storeId);
const ALL = "__all__";
const cats = [ALL, ...new Set(products.map((p) => p.category))];
let cat = ALL;

const catsEl = qs("#cats");
const menuEl = qs("#menu");

function drawCats() {
  catsEl.innerHTML = cats
    .map((c) => {
      const label = c === ALL ? t("cat_all") : categoryLabel(c);
      return `<button type="button" data-cat="${c}" class="${c === cat ? "on" : ""}">${label}</button>`;
    })
    .join("");
}

function drawMenu() {
  const rows = products.filter((p) => cat === ALL || p.category === cat);
  menuEl.innerHTML = rows
    .map((p) => {
      const sold = p.status !== "active";
      return `
      <article class="card product">
        <div>
          <h3>${p.image} ${productLabel(p.product_id, p.product_name)}</h3>
          <div class="muted">${productDesc(p.product_id, p.description)}</div>
          <div class="price">${money(p.price)}</div>
          ${sold ? `<span class="badge sold">${t("soldout")}</span>` : ""}
        </div>
        <button class="btn" data-add="${p.product_id}" ${sold ? "disabled" : ""}>${t("add")}</button>
      </article>`;
    })
    .join("");
}

catsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-cat]");
  if (!btn) return;
  cat = btn.dataset.cat;
  drawCats();
  drawMenu();
});

menuEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const product = products.find((p) => p.product_id === btn.dataset.add);
  const result = cart.add(product, 1);
  if (!result.ok && result.code === "OTHER_STORE") {
    if (confirm(t("other_store"))) {
      cart.clear();
      cart.add(product, 1);
    } else return;
  }
  refreshBadge();
});

drawCats();
drawMenu();
