import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs, setCartBadge } from "../nav.js";
import { initI18n, t, storeLabel, productLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { cartCheckoutEnabled, cartTotalDisplay, createInflight } from "../ui-state.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";
import { parseCartQuantity, planQtyButtonAction, QTY_MAX, QTY_MIN } from "../quantity.js";

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
let lastError = false;
let lastErrorCode = "cart_load_failed";

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
  setCartBadge(qs("#cartCount"));
}

function livePriceMap(products) {
  return new Map((products || []).map((product) => [product.product_id, Number(product.price)]));
}

function lineUnitPrice(item, prices) {
  return prices.has(item.product_id) ? prices.get(item.product_id) : Number(item.unit_price);
}

function paintItems(cur, store, products, { error = false, code = "cart_load_failed" } = {}) {
  lastError = error;
  lastErrorCode = code;
  const prices = livePriceMap(products);
  let total = 0;
  const activeId = document.activeElement?.dataset?.qty || "";
  const activeValue = document.activeElement?.value;
  lines.innerHTML = cur.items
    .map((i) => {
      const unitPrice = lineUnitPrice(i, prices);
      total += unitPrice * i.quantity;
      const atMax = i.quantity >= QTY_MAX;
      return `
    <div class="card cart-line" data-line="${escapeAttr(i.product_id)}">
      <div>
        <strong>${escapeHtml(productLabel(i.product_id, i.product_name))}</strong>
        <div class="muted" data-line-sub>${money(unitPrice)} × ${i.quantity} = ${money(unitPrice * i.quantity)}</div>
      </div>
      <div class="qty">
        <button type="button" data-id="${escapeAttr(i.product_id)}" data-d="-1" aria-label="${escapeAttr(t("qty_decrease"))}">−</button>
        <input aria-label="${escapeAttr(productLabel(i.product_id, i.product_name))}" type="number" min="${QTY_MIN}" max="${QTY_MAX}" inputmode="numeric" data-qty="${escapeAttr(i.product_id)}" value="${i.quantity}" />
        <button type="button" data-id="${escapeAttr(i.product_id)}" data-d="1" ${atMax ? "disabled" : ""} aria-label="${escapeAttr(t("qty_increase"))}" aria-disabled="${atMax ? "true" : "false"}">+</button>
      </div>
    </div>`;
    })
    .join("");
  lines.dataset.ready = "1";
  totalEl.textContent = cartTotalDisplay({ loading: false, total, money });
  setCartBadge(qs("#cartCount"));
  if (activeId) {
    const inp = lines.querySelector(`input[data-qty="${CSS.escape(activeId)}"]`);
    if (inp) {
      inp.focus();
      if (activeValue === "") inp.value = "";
      const len = inp.value.length;
      inp.setSelectionRange?.(len, len);
    }
  }
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
      code,
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

/** Sync line UI from cart without a network round-trip (keeps focus stable). */
function syncLinesFromCart() {
  const cur = cart.get();
  if (!cur.items.length) {
    paintEmpty();
    return;
  }
  const prices = livePriceMap(lastProducts);
  let total = 0;
  for (const item of cur.items) {
    const unitPrice = lineUnitPrice(item, prices);
    total += unitPrice * item.quantity;
    const line = lines.querySelector(`[data-line="${CSS.escape(item.product_id)}"]`);
    if (!line) continue;
    const sub = line.querySelector("[data-line-sub]");
    if (sub) sub.textContent = `${money(unitPrice)} × ${item.quantity} = ${money(unitPrice * item.quantity)}`;
    const inp = line.querySelector("input[data-qty]");
    if (inp && document.activeElement !== inp) inp.value = String(item.quantity);
    else if (inp && inp.value !== "" && Number(inp.value) !== item.quantity) {
      inp.value = String(item.quantity);
    }
    const plus = line.querySelector('button[data-d="1"]');
    if (plus) {
      const atMax = item.quantity >= QTY_MAX;
      plus.disabled = atMax;
      plus.setAttribute("aria-disabled", atMax ? "true" : "false");
    }
  }
  totalEl.textContent = cartTotalDisplay({ loading: false, total, money });
  setCartBadge(qs("#cartCount"));
  const storeOpen = lastStore?.status === "open";
  setCheckoutEnabled(
    cartCheckoutEnabled({
      loading: false,
      error: lastError,
      empty: false,
      storeOpen,
    })
  );
}

function commitQtyInput(inp, { allowEmpty = false } = {}) {
  const productId = inp.dataset.qty;
  const raw = inp.value;
  if (allowEmpty && String(raw).trim() === "") return false;
  const parsed = parseCartQuantity(raw === "" ? "1" : raw, { clamp: true });
  if (!parsed.ok) {
    const current = cart.get().items.find((i) => i.product_id === productId);
    inp.value = String(current?.quantity ?? QTY_MIN);
    return false;
  }
  const result = cart.setQty(productId, parsed.value);
  if (!result.ok) {
    inp.value = String(result.quantity ?? QTY_MIN);
    return false;
  }
  inp.value = String(result.quantity);
  syncLinesFromCart();
  return true;
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
      if (!session?.ok) throw new Error("anonymous_login_failed");
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
    } catch (error) {
      paintItems(cur, lastStore, lastProducts, {
        error: true,
        code: error?.message === "anonymous_login_failed" ? "anonymous_login_failed" : "cart_load_failed",
      });
    }
  });
  if (run?.skipped) return;
}

lines.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn || gate.busy || btn.disabled) return;
  const item = cart.get().items.find((i) => i.product_id === btn.dataset.id);
  if (!item) return;
  const delta = Number(btn.dataset.d);
  const needsConfirm = delta === -1 && item.quantity <= QTY_MIN;
  const confirmed = needsConfirm ? window.confirm(t("cart_remove_confirm")) : false;
  if (needsConfirm && !confirmed) return;
  const action = planQtyButtonAction(item.quantity, delta, { confirmed });
  if (action.type === "noop") return;
  if (action.type === "remove") {
    cart.remove(btn.dataset.id);
    const cur = cart.get();
    if (!cur.items.length) {
      paintEmpty();
      return;
    }
    paintItems(cur, lastStore, lastProducts, { error: lastError, code: lastErrorCode });
    return;
  }
  const result = cart.setQty(btn.dataset.id, action.quantity);
  if (!result.ok) return;
  syncLinesFromCart();
});

lines.addEventListener("input", (e) => {
  const inp = e.target.closest("input[data-qty]");
  if (!inp || gate.busy) return;
  const raw = inp.value;
  if (raw === "") return;
  if (!/^\d+$/.test(String(raw).trim())) {
    const digits = String(raw).replace(/\D/g, "");
    if (digits === "") {
      inp.value = "";
      return;
    }
    inp.value = digits;
  }
  commitQtyInput(inp, { allowEmpty: true });
});

lines.addEventListener("change", (e) => {
  const inp = e.target.closest("input[data-qty]");
  if (!inp || gate.busy) return;
  commitQtyInput(inp);
});

lines.addEventListener("focusout", (e) => {
  const inp = e.target.closest?.("input[data-qty]");
  if (!inp || gate.busy) return;
  commitQtyInput(inp);
});

lines.addEventListener("keydown", (e) => {
  const inp = e.target.closest?.("input[data-qty]");
  if (!inp || gate.busy) return;
  if (e.key === "Enter") {
    e.preventDefault();
    commitQtyInput(inp);
    inp.blur();
  }
});

go.addEventListener("click", (event) => {
  if (go.getAttribute("aria-disabled") === "true") event.preventDefault();
});

showLoading();
render();
