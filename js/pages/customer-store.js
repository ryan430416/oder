import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";

auth.ensureCustomer();

const params = new URLSearchParams(location.search);
const storeId = params.get("store_id") || "";
const store = await api.getStore(storeId);
if (!store) {
  location.href = "index.html";
}

qs("#storeName").textContent = store.store_name;
qs("#storeDesc").textContent = `${store.description} · ${store.open_time}–${store.close_time}`;

function refreshBadge() {
  const n = cart.count();
  qs("#cartCount").textContent = n;
  qs("#cartCount").hidden = n === 0;
}
refreshBadge();

const products = await api.getProducts(storeId);
const cats = ["全部", ...new Set(products.map((p) => p.category))];
let cat = "全部";

const catsEl = qs("#cats");
const menuEl = qs("#menu");

function drawCats() {
  catsEl.innerHTML = cats
    .map((c) => `<button type="button" data-cat="${c}" class="${c === cat ? "on" : ""}">${c}</button>`)
    .join("");
}

function drawMenu() {
  const rows = products.filter((p) => cat === "全部" || p.category === cat);
  menuEl.innerHTML = rows
    .map((p) => {
      const sold = p.status !== "active";
      return `
      <article class="card product">
        <div>
          <h3>${p.image} ${p.product_name}</h3>
          <div class="muted">${p.description}</div>
          <div class="price">${money(p.price)}</div>
          ${sold ? '<span class="badge sold">售完</span>' : ""}
        </div>
        <button class="btn" data-add="${p.product_id}" ${sold ? "disabled" : ""}>加入</button>
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
    if (confirm("購物車已有其他店家商品，是否清空並加入此店？")) {
      cart.clear();
      cart.add(product, 1);
    } else return;
  }
  refreshBadge();
});

drawCats();
drawMenu();
