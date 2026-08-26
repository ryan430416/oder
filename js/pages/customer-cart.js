import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";

initI18n();
auth.ensureCustomer();

const hint = qs("#storeHint");
const lines = qs("#lines");
const totalEl = qs("#total");
const go = qs("#goCheckout");
mountBell(qs("#bellHost"), "notifications.html");

async function render() {
  const cur = cart.get();
  if (!cur.items.length) {
    hint.textContent = t("cart_empty");
    lines.innerHTML = `<p class="empty">${t("cart_hint_empty")}</p>`;
    totalEl.textContent = money(0);
    go.setAttribute("aria-disabled", "true");
    go.style.pointerEvents = "none";
    go.style.opacity = "0.5";
    return;
  }
  const store = await api.getStore(cur.store_id);
  const name = store ? storeLabel(store).name : cur.store_id;
  hint.textContent = t("cart_store", { name, id: cur.store_id });
  lines.innerHTML = cur.items
    .map(
      (i) => `
    <div class="card cart-line">
      <div>
        <strong>${productLabel(i.product_id, i.product_name)}</strong>
        <div class="muted">${money(i.unit_price)} × ${i.quantity} = ${money(i.unit_price * i.quantity)}</div>
      </div>
      <div class="qty">
        <button type="button" data-id="${i.product_id}" data-d="-1">−</button>
        <input type="number" min="1" max="99" inputmode="numeric" data-qty="${i.product_id}" value="${i.quantity}" />
        <button type="button" data-id="${i.product_id}" data-d="1">+</button>
      </div>
    </div>`
    )
    .join("");
  totalEl.textContent = money(cart.total());
  go.style.pointerEvents = "";
  go.style.opacity = "";
}

lines.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const item = cart.get().items.find((i) => i.product_id === btn.dataset.id);
  const next = item.quantity + Number(btn.dataset.d);
  cart.setQty(btn.dataset.id, next);
  render();
});

lines.addEventListener("change", (e) => {
  const inp = e.target.closest("input[data-qty]");
  if (!inp) return;
  let n = parseInt(inp.value, 10);
  if (Number.isNaN(n) || n < 1) n = 1;
  if (n > 99) n = 99;
  cart.setQty(inp.dataset.qty, n);
  render();
});

render();
