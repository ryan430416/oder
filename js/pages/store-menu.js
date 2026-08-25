import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";

const session = auth.requireRole("store", "index.html");
if (!session) {
  /* redirect */
}

const products = await api.getProducts(auth.getBoundStoreId());
qs("#list").innerHTML = products
  .map(
    (p) => `
  <article class="card">
    <strong>${p.product_name}</strong>
    <div class="muted">${p.category} · ${p.product_id}</div>
    <div>${money(p.price)}</div>
    <span class="badge ${p.status === "active" ? "" : "sold"}">${p.status === "active" ? "上架" : p.status}</span>
  </article>`
  )
  .join("");
