import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { initI18n, t, productLabel, productDesc, categoryLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { mountIconPick } from "../easy-pick.js";
import { escapeAttr, escapeHtml } from "../html.js";

initI18n();
auth.requireRole("store", "index.html");

const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const submitBtn = qs("#submitBtn");
const cancelBtn = qs("#cancelEdit");
const iconPick = qs("#iconPick");

mountIconPick(iconPick, { name: "image", value: "🍽️" });
mountBell(qs("#bellHost"), "notifications.html");
qs("#logout").addEventListener("click", () => {
  auth.logout();
  location.href = "index.html";
});

function resetForm() {
  form.reset();
  form.product_id.value = "";
  iconPick._set("🍽️");
  submitBtn.textContent = t("form_add_product");
  cancelBtn.hidden = true;
}

async function render() {
  const products = await api.getProducts(auth.getBoundStoreId());
  if (!products.length) {
    list.innerHTML = `<p class="empty">${t("no_products")}</p>`;
    return;
  }
  list.innerHTML = products
    .map(
      (p) => `
    <article class="card">
      <strong>${escapeHtml(p.image || "")} ${escapeHtml(productLabel(p.product_id, p.product_name))}</strong>
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
  const data = Object.fromEntries(new FormData(form).entries());
  const res = data.product_id
    ? await api.updateProduct(data.product_id, data)
    : await api.createProduct(data);
  if (!res.ok) {
    msg.textContent = t(res.code);
    return;
  }
  msg.textContent = t("saved_ok");
  resetForm();
  await render();
});

cancelBtn.addEventListener("click", () => {
  msg.textContent = "";
  resetForm();
});

list.addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    const products = await api.getProducts(auth.getBoundStoreId());
    const p = products.find((x) => x.product_id === del.dataset.del);
    if (!p) return;
    if (!confirm(t("confirm_delete_product", { name: productLabel(p.product_id, p.product_name) }))) return;
    const res = await api.deleteProduct(p.product_id);
    msg.textContent = res.ok ? t("deleted_ok") : t(res.code);
    if (res.ok && form.product_id.value === p.product_id) resetForm();
    await render();
    return;
  }
  const btn = e.target.closest("[data-edit]");
  if (!btn) return;
  const products = await api.getProducts(auth.getBoundStoreId());
  const p = products.find((x) => x.product_id === btn.dataset.edit);
  if (!p) return;
  form.product_id.value = p.product_id;
  form.product_name.value = p.product_name;
  form.category.value = p.category;
  form.description.value = p.description;
  form.price.value = p.price;
  iconPick._set(p.image || "🍽️");
  form.status.value = p.status;
  submitBtn.textContent = t("form_save_product");
  cancelBtn.hidden = false;
  form.price.focus();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

resetForm();
render();
