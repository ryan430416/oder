import { auth } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { money, pickupSlotsForStore } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel } from "../i18n.js";
import { escapeHtml } from "../html.js";

initI18n();
let session = auth.ensureCustomer();
const c = cart.get();
if (!c.items.length) {
  location.replace("cart.html");
  throw new Error("empty_cart");
}

qs("#custName").value = session.name && session.name !== "學生小明" ? session.name : "";
qs("#custGrade").value = session.grade || "";

const store = await api.getStore(c.store_id);
const pickup = qs("#pickup");
const confirmButton = qs("#confirm");
const msg = qs("#msg");
let pageError = "";

if (!store) pageError = "no_store";
else if (store.status !== "open") pageError = "store_closed";

const products = store ? await api.getProducts(store.store_id) : [];
const liveItems = c.items.map((item) => {
  const product = products.find(
    (candidate) => candidate.product_id === item.product_id && candidate.status === "active"
  );
  const quantity = Number(item.quantity);
  const price = Number(product?.price);
  if (
    !product ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 99 ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return null;
  }
  return { ...item, quantity, product_name: product.product_name, unit_price: price };
});
if (liveItems.some((item) => !item)) pageError ||= "invalid_items";

const slots = pickupSlotsForStore(store);
slots.forEach((s) => {
  const opt = document.createElement("option");
  opt.value = s.value;
  opt.textContent = s.label;
  pickup.appendChild(opt);
});
if (!slots.length) pageError ||= "no_pickup_slots";
if (pageError) {
  const opt = document.createElement("option");
  opt.textContent = t(pageError);
  opt.value = "";
  pickup.replaceChildren(opt);
  confirmButton.disabled = true;
  msg.textContent = t(pageError);
}

const storeName = store ? storeLabel(store).name : c.store_id;
const validItems = liveItems.filter(Boolean);
const total = validItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
qs("#summary").innerHTML = `
  <strong>${escapeHtml(t("order_content"))}</strong>
  <p class="muted">${escapeHtml(storeName)}</p>
  <ul class="item-list">
    ${validItems.map((i) => `<li>${escapeHtml(productLabel(i.product_id, i.product_name))} × ${i.quantity}　${money(i.unit_price * i.quantity)}</li>`).join("")}
  </ul>
  <p><strong>${escapeHtml(t("sum", { amount: money(total) }))}</strong></p>
`;

confirmButton.addEventListener("click", async () => {
  if (pageError || !pickup.value) return;
  const named = auth.setCustomerProfile(qs("#custName").value, qs("#custGrade").value);
  if (!named.ok) {
    msg.textContent = t(named.code);
    return;
  }
  session = named.session;
  confirmButton.disabled = true;
  const res = await api.createOrder({
    customer_id: session.user_id,
    customer_name: session.name,
    customer_grade: session.grade,
    store_id: c.store_id,
    pickup_time: pickup.value,
    payment_method: qs("#pay").value,
    items: validItems.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
  });
  if (res.ok) {
    cart.clear();
    msg.textContent = t("order_created", { id: res.order.order_id });
    location.href = "orders.html";
  } else {
    msg.textContent = t(res.code || "order_fail");
    confirmButton.disabled = false;
  }
});
