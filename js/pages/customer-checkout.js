import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money, todaySlots } from "../format.js";
import { qs } from "../nav.js";

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

qs("#summary").innerHTML = `
  <strong>訂單內容</strong>
  <p class="muted">${store ? store.store_name : c.store_id}</p>
  <ul class="item-list">
    ${c.items.map((i) => `<li>${i.product_name} × ${i.quantity}　${money(i.unit_price * i.quantity)}</li>`).join("")}
  </ul>
  <p><strong>合計 ${money(cart.total())}</strong></p>
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
    qs("#msg").textContent = "已建立訂單 " + res.order.order_id;
    location.href = "orders.html";
  } else {
    qs("#msg").textContent = "下單失敗";
    qs("#confirm").disabled = false;
  }
});
