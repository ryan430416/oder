import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { cartCheckoutEnabled, cartTotalDisplay, createInflight } from "../ui-state.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

initI18n();

const hint = qs("#storeHint");
const lines = qs("#lines");
const totalEl = qs("#total");
const go = qs("#goCheckout");
const statusEl = qs("#cartStatus");
const gate = createInflight();
let lastStore = null;
let lastProducts = [];
let bellMounted = false;

function setCheckoutEnabled(enabled) {
  go.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function showLoading() {
  hint.textContent = t("cart_updating");
  totalEl.textContent = cartTotalDisplay({ loading: true, money });
  setCheckoutEnabled(false);
  if (!lines.dataset.ready) {
    lines.innerHTML = `<div class="card skeleton" aria-hidden="true"></div>`;
  }
}

function paintEmpty() {
  hideBackendNotice(statusEl);
  hint.textContent = t("cart_empty");
  lines.innerHTML = `<p class="empty">${t("cart_hint_empty")}</p>`;
  lines.dataset.ready = "1";
  totalEl.textContent = cartTotalDisplay({ loading: false, empty: true, money });
  setCheckoutEnabled(false);
}

function paintItems(cur, store, products, { error = false } = {}) {
  const livePrices = new Map((products || []).map((product) => [product.product_id, Number(product.price)]));
  let total = 0;
  lines.innerHTML = cur.items
    .map((i) => {
      const unitPrice = livePrices.has(i.product_id) ? livePrices.get(i.product_id) : Number(i.unit_price);
      total += unitPrice * i.quantity;
      return `
    <div class="card cart-line">
      <div>
        <strong>${escapeHtml(productLabel(i.product_id, i.product_name))}</strong>
        <div class="muted">${money(unitPrice)} × ${i.quantity} = ${money(unitPrice * i.quantity)}</div>
      </div>
      <div class="qty">
        <button type="button" data-id="${escapeAttr(i.product_id)}" data-d="-1">−</button>
        <input aria-label="${escapeAttr(productLabel(i.product_id, i.product_name))}" type="number" min="1" max="99" inputmode="numeric" data-qty="${escapeAttr(i.product_id)}" value="${i.quantity}" />
        <button type="button" data-id="${escapeAttr(i.product_id)}" data-d="1">+</button>
      </div>
    </div>`;
    })
    .join("");
  lines.dataset.ready = "1";
  totalEl.textContent = cartTotalDisplay({ loading: false, total, money });
  const storeOpen = store?.status === "open";
  const enabled = cartCheckoutEnabled({
    loading: false,
    error,
    empty: false,
    storeOpen,
  });
  setCheckoutEnabled(enabled);
  if (error) {
    renderBackendNotice(statusEl, {
      code: "cart_load_failed",
      busy: gate.busy,
      onRetry: () => render(),
    });
    hint.textContent = store ? t("cart_store", { name: storeLabel(store).name }) : t("cart_updating");
    return;
  }
  hideBackendNotice(statusEl);
  if (!store) {
    hint.textContent = t("no_store");
    setCheckoutEnabled(false);
    return;
  }
  if (!storeOpen) {
    hint.textContent = t("store_closed");
    return;
  }
  hint.textContent = t("cart_store", { name: storeLabel(store).name });
}

async function render() {
  const cur = cart.get();
  if (!cur.items.length) {
    paintEmpty();
    return;
  }
  const run = await gate.run(async () => {
    showLoading();
    try {
      const session = await auth.ensureCustomer();
      if (!session) throw new Error("backend_unavailable");
      if (!bellMounted) {
        mountBell(qs("#bellHost"), "notifications.html");
        bellMounted = true;
      }
      const storeResult = await api.getStore(cur.store_id);
      if (!storeResult.ok) throw new Error("backend_error");
      const store = storeResult.data;
      const productResult = store ? await api.getProducts(cur.store_id) : { ok: true, data: [] };
      if (!productResult.ok) throw new Error("backend_error");
      lastStore = store;
      lastProducts = productResult.data || [];
      paintItems(cur, lastStore, lastProducts, { error: false });
    } catch {
      paintItems(cur, lastStore, lastProducts, { error: true });
    }
  });
  if (run?.skipped) return;
}

lines.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn || gate.busy) return;
  const item = cart.get().items.find((i) => i.product_id === btn.dataset.id);
  if (!item) return;
  const next = item.quantity + Number(btn.dataset.d);
  cart.setQty(btn.dataset.id, next);
  render();
});

lines.addEventListener("change", (e) => {
  const inp = e.target.closest("input[data-qty]");
  if (!inp || gate.busy) return;
  let n = parseInt(inp.value, 10);
  if (Number.isNaN(n) || n < 1) n = 1;
  if (n > 99) n = 99;
  cart.setQty(inp.dataset.qty, n);
  render();
});

go.addEventListener("click", (event) => {
  if (go.getAttribute("aria-disabled") === "true") event.preventDefault();
});

showLoading();
render();
