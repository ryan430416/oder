import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money, todaySlots } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel } from "../i18n.js";

initI18n();
const session = auth.ensureCustomer();
const c = cart.get();
if (!c.items.length) location.href = "cart.html";

const store = await api.getStore(c.store_id);
const pickup = qs("#pickup");
todaySlots().forEach((s) => {
  const opt = document.createElement("option");
  opt.value = s.value;
  opt.textContent = s.label;
  pickup.appendChild(opt);
});

const storeName = store ? storeLabel(store).name : c.store_id;
qs("#summary").innerHTML = `
  <strong>${t("order_content")}</strong>
  <p class="muted">${storeName}</p>
  <ul class="item-list">
    ${c.items.map((i) => `<li>${productLabel(i.product_id, i.product_name)} × ${i.quantity}　${money(i.unit_price * i.quantity)}</li>`).join("")}
  </ul>
  <p><strong>${t("sum", { amount: money(cart.total()) })}</strong></p>
`;

qs("#confirm").addEventListener("click", async () => {
  qs("#confirm").disabled = true;
  const res = await api.createOrder({
    customer_id: session.user_id,
    store_id: c.store_id,
    pickup_time: pickup.value,
    payment_method: qs("#pay").value,
    items: c.items,
  });
  if (res.ok) {
    cart.clear();
    qs("#msg").textContent = t("order_created", { id: res.order.order_id });
    location.href = "orders.html";
  } else {
    qs("#msg").textContent = t("order_fail");
    qs("#confirm").disabled = false;
  }
});
