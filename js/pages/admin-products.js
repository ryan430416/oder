import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel, productLabel, productDesc, categoryLabel } from "../i18n.js";

initI18n();
auth.requireRole("admin", "index.html");

const pick = qs("#storePick");
const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const submitBtn = qs("#submitBtn");

function payload() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.store_id = pick.value;
  return data;
}

async function fillStores() {
  const stores = await api.getStores();
  pick.innerHTML = stores
    .map((s) => `<option value="${s.store_id}">${storeLabel(s).name} (${s.store_id})</option>`)
    .join("");
  if (!stores.length) pick.innerHTML = `<option value="">${t("no_stores")}</option>`;
}

async function render() {
  const storeId = pick.value;
  if (!storeId) {
    list.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
    return;
  }
  const products = await api.getProducts(storeId);
  if (!products.length) {
    list.innerHTML = `<p class="empty">${t("no_products")}</p>`;
    return;
  }
  list.innerHTML = products
    .map(
      (p) => `
    <article class="card">
      <strong>${p.image || ""} ${productLabel(p.product_id, p.product_name)}</strong>
      <div class="muted">${categoryLabel(p.category)} · ${p.product_id}</div>
      <div class="muted">${productDesc(p.product_id, p.description)}</div>
      <div>${money(p.price)}</div>
      <span class="badge ${p.status === "active" ? "" : "sold"}">${p.status === "active" ? t("listed") : t("soldout")}</span>
      <div class="row-actions">
        <button class="btn btn-ghost" type="button" data-edit="${p.product_id}">${t("edit")}</button>
      </div>
    </article>`
    )
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  const data = payload();
  if (!data.store_id) {
    msg.textContent = t("no_store");
    return;
  }
  const res = data.product_id
    ? await api.updateProduct(data.product_id, data)
    : await api.createProduct(data);
  if (!res.ok) {
    msg.textContent = t(res.code);
    return;
  }
  form.reset();
  form.product_id.value = "";
  submitBtn.textContent = t("form_add_product");
  render();
});

pick.addEventListener("change", () => {
  form.reset();
  form.product_id.value = "";
  submitBtn.textContent = t("form_add_product");
  render();
});

list.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-edit]");
  if (!btn) return;
  const products = await api.getProducts(pick.value);
  const p = products.find((x) => x.product_id === btn.dataset.edit);
  if (!p) return;
  form.product_id.value = p.product_id;
  form.product_name.value = p.product_name;
  form.category.value = p.category;
  form.description.value = p.description;
  form.price.value = p.price;
  form.image.value = p.image;
  form.status.value = p.status;
  submitBtn.textContent = t("form_save_product");
});

await fillStores();
await render();
