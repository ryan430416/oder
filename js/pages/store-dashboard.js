import { auth } from "../auth.js";
import { api } from "../api.js";
import { STATUS_LABEL, money, formatTime } from "../format.js";
import { qs } from "../nav.js";

const session = auth.requireRole("store", "index.html");
if (!session) {
  /* redirect */
}

qs("#title").textContent = session.name;
qs("#bound").textContent = `綁定 Store ID：${auth.getBoundStoreId()}（由帳號決定，非前端傳入）`;
qs("#logout").addEventListener("click", () => {
  auth.logout();
  location.href = "index.html";
});

const GROUPS = [
  { id: "new", label: "新訂單", match: (s) => s === "pending" },
  { id: "cook", label: "製作中", match: (s) => s === "accepted" || s === "preparing" },
  { id: "wait", label: "等待取餐", match: (s) => s === "ready" },
  { id: "done", label: "已完成", match: (s) => ["completed", "rejected", "cancelled"].includes(s) },
];
let group = "new";

function actions(status) {
  if (status === "pending") {
    return `<button class="btn" data-next="accepted">接受</button>
            <button class="btn btn-danger" data-next="rejected">拒絕</button>`;
  }
  if (status === "accepted") {
    return `<button class="btn" data-next="preparing">開始製作</button>`;
  }
  if (status === "preparing") {
    return `<button class="btn" data-next="ready">製作完成／可取餐</button>`;
  }
  if (status === "ready") {
    return `<button class="btn" data-next="completed">完成訂單</button>`;
  }
  return "";
}

const tabs = qs("#tabs");
const list = qs("#list");

function drawTabs() {
  tabs.innerHTML = GROUPS.map(
    (g) => `<button type="button" data-g="${g.id}" class="${g.id === group ? "on" : ""}">${g.label}</button>`
  ).join("");
}

async function render() {
  const orders = await api.getStoreOrders();
  const g = GROUPS.find((x) => x.id === group);
  const rows = orders.filter((o) => g.match(o.status));
  if (!rows.length) {
    list.innerHTML = `<p class="empty">目前沒有訂單</p>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (o) => `
    <article class="card order-card" data-oid="${o.order_id}">
      <div class="order-meta">
        <strong>${o.order_id}</strong>
        <span class="status ${o.status}">${STATUS_LABEL[o.status]}</span>
      </div>
      <div class="muted">取餐 ${formatTime(o.pickup_time)} · ${money(o.total)}</div>
      <ul class="item-list">${o.items.map((i) => `<li>${i.product_name} × ${i.quantity}</li>`).join("")}</ul>
      <div class="row-actions">${actions(o.status)}</div>
    </article>`
    )
    .join("");
}

tabs.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-g]");
  if (!btn) return;
  group = btn.dataset.g;
  drawTabs();
  render();
});

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-next]");
  if (!btn) return;
  const card = btn.closest("[data-oid]");
  const res = await api.updateOrderStatus(card.dataset.oid, btn.dataset.next);
  if (!res.ok) alert(res.message);
  render();
});

drawTabs();
render();
