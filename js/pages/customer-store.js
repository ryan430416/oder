import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel, productDesc, categoryLabel } from "../i18n.js";
import { escapeAttr, escapeHtml, productImageHtml } from "../html.js";
import { schoolPickupWindowsLabel } from "../service-periods.js";
import { mountImageUi } from "../image-ui.js";
import { mountIcons } from "../icons.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

initI18n();
mountIcons();

const menuEl = qs("#menu");
const catsEl = qs("#cats");
const statusEl = qs("#storeStatus");

function refreshBadge() {
  const n = cart.count();
  qs("#cartCount").textContent = n;
  qs("#cartCount").hidden = n === 0;
}

async function boot() {
  menuEl.innerHTML = `<div class="card skeleton" aria-hidden="true"></div>`;
  try {
    if (!(await auth.ensureCustomer())) throw new Error("backend_unavailable");
    const params = new URLSearchParams(location.search);
    const storeId = params.get("store_id") || "";
    const storeResult = await api.getStore(storeId);
    if (!storeResult.ok) throw new Error("backend_error");
    const store = storeResult.data;
    if (!store) {
      location.replace("index.html");
      return;
    }
    hideBackendNotice(statusEl);
    const lab = storeLabel(store);
    qs("#storeName").textContent = lab.name;
    qs("#storeDesc").textContent = `${lab.desc} · ${schoolPickupWindowsLabel()}`;
    const storeClosed = store.status !== "open";
    refreshBadge();

    const productResult = await api.getProducts(storeId);
    if (!productResult.ok) throw new Error("backend_error");
    const products = productResult.data || [];
    const ALL = "__all__";
    const cats = [ALL, ...new Set(products.map((p) => p.category))];
    let cat = ALL;

    function drawCats() {
      catsEl.innerHTML = cats
        .map((c) => {
          const label = c === ALL ? t("cat_all") : categoryLabel(c);
          return `<button type="button" data-cat="${escapeAttr(c)}" class="${c === cat ? "on" : ""}">${escapeHtml(label)}</button>`;
        })
        .join("");
    }

    function drawMenu() {
      const rows = products.filter((p) => cat === ALL || p.category === cat);
      menuEl.innerHTML = rows
        .map((p) => {
          const sold = p.status !== "active" || storeClosed;
          return `
      <article class="card product">
        <div>
          ${productImageHtml(p.image, p.product_name)}
          <h3>${escapeHtml(productLabel(p.product_id, p.product_name))}</h3>
          <div class="muted">${escapeHtml(productDesc(p.product_id, p.description))}</div>
          <div class="price">${money(p.price)}</div>
          ${sold ? `<span class="badge sold">${escapeHtml(storeClosed ? t("store_closed") : t("soldout"))}</span>` : ""}
        </div>
        <button class="btn" data-add="${escapeAttr(p.product_id)}" ${sold ? "disabled" : ""}>${escapeHtml(t("add"))}</button>
      </article>`;
        })
        .join("");
      mountImageUi(menuEl);
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
      if (!btn || storeClosed) return;
      const product = products.find((p) => p.product_id === btn.dataset.add);
      const result = cart.add(product, 1);
      if (!result.ok && result.code === "OTHER_STORE") {
        if (confirm(t("other_store"))) {
          cart.clear();
          cart.add(product, 1);
        } else return;
      } else if (!result.ok) alert(t("invalid_items"));
      refreshBadge();
    });

    drawCats();
    drawMenu();
  } catch {
    menuEl.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "stores_load_failed",
      busy: false,
      onRetry: () => boot(),
    });
  }
}

boot();
