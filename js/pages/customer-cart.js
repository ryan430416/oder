import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money } from "../format.js";
import { qs } from "../nav.js";

auth.ensureCustomer();

const c = cart.get();
const hint = qs("#storeHint");
const lines = qs("#lines");
const totalEl = qs("#total");
const go = qs("#goCheckout");

async function render() {
  const cur = cart.get();
  if (!cur.items.length) {
    hint.textContent = "購物車是空的";
    lines.innerHTML = `<p class="empty">請先選店加購</p>`;
    totalEl.textContent = money(0);
    go.setAttribute("aria-disabled", "true");
    go.style.pointerEvents = "none";
    go.style.opacity = "0.5";
    return;
  }
  const store = await api.getStore(cur.store_id);
  hint.textContent = store ? `店家：${store.store_name}（${store.store_id}）` : cur.store_id;
  lines.innerHTML = cur.items
    .map(
      (i) => `
    <div class="card cart-line">
      <div>
        <strong>${i.product_name}</strong>
        <div class="muted">${money(i.unit_price)} × ${i.quantity} = ${money(i.unit_price * i.quantity)}</div>
      </div>
      <div class="qty">
        <button type="button" data-id="${i.product_id}" data-d="-1">−</button>
        <span>${i.quantity}</span>
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

render();
