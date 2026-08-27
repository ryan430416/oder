import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { t, storeLabel, productLabel, productDesc, categoryLabel } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { mountIconPick } from "../easy-pick.js";
import { escapeAttr, escapeHtml, productImageHtml } from "../html.js";
import { uploadProductImage } from "../product-image.js";

if (!bootAdmin()) throw new Error("admin");

const pick = qs("#storePick");
const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const submitBtn = qs("#submitBtn");
const iconPick = qs("#iconPick");
const photoInput = qs("#adminProductPhoto");
const photoPreview = qs("#photoPreview");

mountIconPick(iconPick, { name: "image", value: "🍽️" });
photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  photoPreview.innerHTML = file ? productImageHtml(URL.createObjectURL(file), file.name) : "";
});

function payload() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.store_id = pick.value;
  return data;
}

async function fillStores() {
  const stores = await api.getStores();
  const want = new URLSearchParams(location.search).get("store_id") || "";
  pick.innerHTML = stores
    .map((s) => `<option value="${escapeAttr(s.store_id)}">${escapeHtml(storeLabel(s).name)} (${escapeHtml(s.store_id)})</option>`)
    .join("");
  if (!stores.length) pick.innerHTML = `<option value="">${t("no_stores")}</option>`;
  if (want && stores.some((s) => s.store_id === want)) pick.value = want;
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
      ${productImageHtml(p.image, p.product_name)}
      <strong>${escapeHtml(productLabel(p.product_id, p.product_name))}</strong>
      <div class="muted">${escapeHtml(categoryLabel(p.category))} · ${escapeHtml(p.product_id)}</div>
      <div class="muted">${escapeHtml(productDesc(p.product_id, p.description))}</div>
      <div>${money(p.price)}</div>
      <span class="badge ${p.status === "active" ? "" : "sold"}">${p.status === "active" ? t("listed") : t("soldout")}</span>
      <div class="row-actions">
        <button class="btn btn-ghost" type="button" data-edit="${escapeAttr(p.product_id)}">${escapeHtml(t("edit"))}</button>
        <button class="btn btn-danger" type="button" data-del="${escapeAttr(p.product_id)}">${escapeHtml(t("delete"))}</button>
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
  const upload = await uploadProductImage(photoInput.files[0], data.store_id);
  if (!upload.ok) {
    msg.textContent = t(upload.code);
    return;
  }
  if (upload.url) data.image = upload.url;
  const res = data.product_id
    ? await api.updateProduct(data.product_id, data)
    : await api.createProduct(data);
  if (!res.ok) {
    msg.textContent = t(res.code);
    return;
  }
  msg.textContent = t("saved_ok");
  form.reset();
  form.product_id.value = "";
  iconPick._set("🍽️");
  photoPreview.replaceChildren();
  submitBtn.textContent = t("form_add_product");
  render();
});

pick.addEventListener("change", () => {
  form.reset();
  form.product_id.value = "";
  iconPick._set("🍽️");
  photoPreview.replaceChildren();
  submitBtn.textContent = t("form_add_product");
  msg.textContent = "";
  render();
});

list.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const products = await api.getProducts(pick.value);
    const p = products.find((x) => x.product_id === del.dataset.del);
    if (!p) return;
    if (!confirm(t("confirm_delete_product", { name: productLabel(p.product_id, p.product_name) }))) return;
    const res = await api.deleteProduct(p.product_id);
    msg.textContent = res.ok ? t("deleted_ok") : t(res.code);
    if (res.ok && form.product_id.value === p.product_id) {
      form.reset();
      form.product_id.value = "";
      iconPick._set("🍽️");
      submitBtn.textContent = t("form_add_product");
    }
    render();
    return;
  }
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
  iconPick._set(p.image);
  photoPreview.innerHTML = productImageHtml(p.image, p.product_name);
  form.status.value = p.status;
  submitBtn.textContent = t("form_save_product");
});

await fillStores();
await render();
