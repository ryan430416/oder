import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs } from "../nav.js";
import { t, productLabel, productDesc, categoryLabel } from "../i18n.js";
import { runStorePage } from "../store-boot.js";
import { mountBell } from "../notify-ui.js";
import { escapeAttr, escapeHtml, productImageHtml } from "../html.js";
import {
  deleteProductImage,
  validateProductImage,
} from "../product-image.js";
import { saveProductWithImage } from "../product-save.js";
import { mountImageUi } from "../image-ui.js";
import { showToast } from "../toast.js";
import { createInflight } from "../ui-state.js";
import { photoSelectionResult } from "../admin-data.js";

await runStorePage(async () => {
const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const submitBtn = qs("#submitBtn");
const cancelBtn = qs("#cancelEdit");
const photoInput = qs("#storeProductPhoto");
const photoPreview = qs("#photoPreview");
const progress = qs("#uploadProgress");
const removePhoto = qs("#removePhoto");
const retryUpload = qs("#retryUpload");
let currentImagePath = "";
let originalImagePath = "";
let previewUrl = "";
let variantRows = [];
const gate = createInflight();
const variantRowsEl = qs("#variantRows");
const addVariantBtn = qs("#addVariant");

mountImageUi();
mountBell(qs("#bellHost"), "notifications.html");

function clearPreviewUrl() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
}

function showPreview(url, alt = "") {
  const usable = Boolean(String(url || "").trim());
  retryUpload.hidden = true;
  if (!usable) {
    photoPreview.innerHTML = "";
    photoPreview.hidden = true;
    removePhoto.hidden = true;
    return;
  }
  photoPreview.hidden = false;
  photoPreview.innerHTML = productImageHtml(url, alt);
  removePhoto.hidden = false;
  mountImageUi(photoPreview);
}

function drawVariants() {
  if (!variantRowsEl) return;
  variantRowsEl.innerHTML = variantRows
    .map(
      (row, index) => `
      <div class="row-actions" data-variant-row="${index}">
        <input aria-label="${escapeAttr(t("variant"))}" data-v="name" value="${escapeAttr(row.name || "")}" maxlength="40" />
        <input aria-label="${escapeAttr(t("form_price"))}" data-v="price" type="number" min="0" step="1" value="${escapeAttr(row.price ?? "")}" />
        <input aria-label="sort" data-v="sort" type="number" min="0" step="1" value="${escapeAttr(row.sort ?? index)}" />
        <label><input data-v="status" type="checkbox" ${row.status === "disabled" ? "" : "checked"} /> ${escapeHtml(t("listed"))}</label>
        <button class="btn btn-ghost" type="button" data-v-remove="${index}">${escapeHtml(t("variant_disabled"))}</button>
      </div>`
    )
    .join("");
}

function readVariantRows() {
  return [...variantRowsEl.querySelectorAll("[data-variant-row]")].map((row, index) => ({
    id: variantRows[index]?.id || "",
    name: row.querySelector("[data-v=name]").value,
    price: row.querySelector("[data-v=price]").value,
    sort: row.querySelector("[data-v=sort]").value,
    status: row.querySelector("[data-v=status]").checked ? "active" : "disabled",
  }));
}

function resetForm() {
  form.reset();
  form.product_id.value = "";
  variantRows = [];
  drawVariants();
  currentImagePath = "";
  originalImagePath = "";
  clearPreviewUrl();
  showPreview("");
  progress.hidden = true;
  retryUpload.hidden = true;
  submitBtn.textContent = t("form_add_product");
  cancelBtn.hidden = true;
}

photoInput.addEventListener("change", async () => {
  clearPreviewUrl();
  msg.textContent = "";
  retryUpload.hidden = true;
  const file = photoInput.files?.[0];
  if (!file) {
    showPreview("");
    return;
  }
  let validation;
  try {
    validation = await validateProductImage(file);
  } catch {
    photoInput.value = "";
    showPreview("");
    msg.textContent = t("invalid_image_type");
    return;
  }
  const next = photoSelectionResult(validation);
  if (!next.preview) {
    photoInput.value = "";
    showPreview("");
    msg.textContent = t(next.message);
    return;
  }
  previewUrl = URL.createObjectURL(file);
  showPreview(previewUrl, file.name);
  msg.textContent = t(next.message);
});

removePhoto.addEventListener("click", () => {
  clearPreviewUrl();
  currentImagePath = "";
  photoInput.value = "";
  showPreview("");
});

retryUpload.addEventListener("click", () => form.requestSubmit());
addVariantBtn?.addEventListener("click", () => {
  variantRows = readVariantRows();
  variantRows.push({ id: "", name: "", price: "", sort: variantRows.length, status: "active" });
  drawVariants();
});
variantRowsEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-v-remove]");
  if (!button) return;
  variantRows = readVariantRows().filter((_, index) => index !== Number(button.dataset.vRemove));
  drawVariants();
});

async function render() {
  list.setAttribute("aria-busy", "true");
  const productsResult = await api.getProducts(auth.getBoundStoreId());
  const products = productsResult.ok ? productsResult.data || [] : [];
  list.removeAttribute("aria-busy");
  if (!products.length) {
    list.innerHTML = `<p class="empty">${t("no_products")}</p>`;
    return;
  }
  list.innerHTML = products
    .map(
      (product) => `
    <article class="card product-admin-card">
      ${productImageHtml(product.image, product.product_name, { previewSrc: product.image_full || product.image })}
      <strong>${escapeHtml(productLabel(product.product_id, product.product_name))}</strong>
      <div class="muted">${escapeHtml(categoryLabel(product.category))}</div>
      <div class="muted">${escapeHtml(productDesc(product.product_id, product.description))}</div>
      <div>${money(product.price)}</div>
      <span class="badge ${escapeAttr(product.status)}">${escapeHtml(t(product.status === "active" ? "listed" : product.status))}</span>
      <div class="row-actions">
        <button class="btn btn-ghost" type="button" data-edit="${escapeAttr(product.product_id)}">${escapeHtml(t("edit"))}</button>
        <button class="btn btn-danger" type="button" data-del="${escapeAttr(product.product_id)}">${escapeHtml(t("delete"))}</button>
      </div>
    </article>`
    )
    .join("");
  mountImageUi(list);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const run = await gate.run(async () => {
    msg.textContent = "";
    retryUpload.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    const storeId = auth.getBoundStoreId();
    submitBtn.disabled = true;
    progress.hidden = !photoInput.files[0];
    progress.value = 0;
    let result;
    try {
      result = await saveProductWithImage({
        isUpdate: Boolean(form.product_id.value),
        productId: form.product_id.value,
        storeId,
        fields: data,
        file: photoInput.files[0] || null,
        currentImagePath,
        previousImagePath: originalImagePath,
        imageRemoved: !photoInput.files[0] && Boolean(originalImagePath) && !currentImagePath,
        onProgress: (value) => (progress.value = value),
      });
    } finally {
      submitBtn.disabled = false;
      progress.hidden = true;
    }
    if (!result.ok) {
      msg.textContent = t(result.code || "image_upload_failed");
      retryUpload.hidden = !["image_upload_failed", "image_network_failed", "image_compress_failed", "storage_forbidden"].includes(result.code);
      return;
    }
    if (result.productId) {
      const savedVariants = await api.replaceProductVariants(result.productId, readVariantRows());
      if (!savedVariants.ok) {
        msg.textContent = t(savedVariants.code || "backend_error");
        await render();
        return;
      }
    }
    msg.textContent = t("saved_ok");
    showToast(t("saved_ok"));
    resetForm();
    await render();
  });
  if (run?.skipped) return;
});

cancelBtn.addEventListener("click", resetForm);

list.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-del]");
  const editButton = event.target.closest("[data-edit]");
  if (!deleteButton && !editButton) return;
  const productsResult = await api.getProducts(auth.getBoundStoreId());
  const products = productsResult.ok ? productsResult.data || [] : [];
  const productId = (deleteButton || editButton).dataset.del || editButton?.dataset.edit;
  const product = products.find((item) => item.product_id === productId);
  if (!product) return;

  if (deleteButton) {
    if (!confirm(t("confirm_delete_product", { name: product.product_name }))) return;
    deleteButton.disabled = true;
    const result = await api.deleteProduct(product.product_id);
    if (!result.ok) {
      deleteButton.disabled = false;
      msg.textContent = t(result.code || "backend_error");
      showToast(msg.textContent, "error");
      return;
    }
    if (result.deleted && result.image_path) {
      await deleteProductImage(result.image_path);
    }
    msg.textContent = t(result.hidden ? "product_hidden_history" : "deleted_ok");
    showToast(msg.textContent, "success");
    if (form.product_id.value === product.product_id) resetForm();
    await render();
    return;
  }

  form.product_id.value = product.product_id;
  form.product_name.value = product.product_name;
  form.category.value = product.category;
  form.description.value = product.description;
  form.price.value = product.price;
  form.status.value = product.status;
  variantRows = (product.variants || []).map((row) => ({
    id: row.variant_id || row.id,
    name: row.name,
    price: row.price,
    sort: row.sort || 0,
    status: row.status || "active",
  }));
  drawVariants();
  currentImagePath = product.image_path || "";
  originalImagePath = currentImagePath;
  showPreview(product.image, product.product_name);
  submitBtn.textContent = t("form_save_product");
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

resetForm();
await render();
});
