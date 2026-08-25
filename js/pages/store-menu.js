import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, productLabel, categoryLabel } from "../i18n.js";

initI18n();
auth.requireRole("store", "index.html");

const products = await api.getProducts(auth.getBoundStoreId());
qs("#list").innerHTML = products
  .map(
    (p) => `
  <article class="card">
    <strong>${productLabel(p.product_id, p.product_name)}</strong>
    <div class="muted">${categoryLabel(p.category)} · ${p.product_id}</div>
    <div>${money(p.price)}</div>
    <span class="badge ${p.status === "active" ? "" : "sold"}">${p.status === "active" ? t("listed") : t("soldout")}</span>
  </article>`
  )
  .join("");
