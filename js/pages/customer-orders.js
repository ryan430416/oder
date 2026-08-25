import { auth } from "../auth.js";
import { api } from "../api.js";
import { STATUS_LABEL, money, formatTime } from "../format.js";
import { qs } from "../nav.js";

const session = auth.ensureCustomer();
const FILTERS = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待接單" },
  { id: "preparing", label: "製作中" },
  { id: "ready", label: "可取餐" },
  { id: "completed", label: "已完成" },
];
let filter = "all";
const tabs = qs("#tabs");
const list = qs("#list");

function match(o) {
  if (filter === "all") return true;
  if (filter === "preparing") return o.status === "accepted" || o.status === "preparing";
  return o.status === filter;
}

function drawTabs() {
  tabs.innerHTML = FILTERS.map(
    (f) => `<button type="button" data-f="${f.id}" class="${f.id === filter ? "on" : ""}">${f.label}</button>`
  ).join("");
}

async function render() {
  const orders = await api.getCustomerOrders(session.user_id);
  const rows = orders.filter(match);
  if (!rows.length) {
    list.innerHTML = `<p class="empty">尚無訂單</p>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (o) => `
    <article class="card order-card">
      <div class="order-meta">
        <strong>${o.order_id}</strong>
        <span class="status ${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
      </div>
      <div class="muted">取餐 ${formatTime(o.pickup_time)} · ${money(o.total)}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${i.product_name} × ${i.quantity}</li>`).join("")}</ul>
    </article>`
    )
    .join("");
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-f]");
  if (!btn) return;
  filter = btn.dataset.f;
  drawTabs();
  render();
});

drawTabs();
render();
