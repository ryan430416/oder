import { auth } from "../auth.js";
import { api } from "../api.js";
import { money } from "../format.js";
import { qs, goToPage } from "../nav.js";
import { initI18n, t, productLabel, productDesc, categoryLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { escapeAttr, escapeHtml, productImageHtml } from "../html.js";
import {
  deleteProductImage,
  uploadProductImage,
  validateProductImage,
} from "../product-image.js";
import { mountImageUi } from "../image-ui.js";
import { showToast } from "../toast.js";

initI18n();
if (!(await auth.requireRole("store", "index.html"))) throw new Error("store");

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

mountImageUi();
mountBell(qs("#bellHost"), "notifications.html");
qs("#logout").addEventListener("click", async () => {
  await auth.logout();
  goToPage("index.html");
});

function clearPreviewUrl() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
}

function showPreview(url, alt = "") {
  photoPreview.innerHTML = productImageHtml(url, alt);
  removePhoto.hidden = !url;
  mountImageUi(photoPreview);
}

function resetForm() {
  form.reset();
  form.product_id.value = "";
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
  const file = photoInput.files[0];
  if (!file) return showPreview(currentImagePath ? photoPreview.querySelector("img")?.src : "");
  const validation = await validateProductImage(file);
  if (!validation.ok) {
    photoInput.value = "";
    msg.textContent = t(validation.code);
    return;
  }
  previewUrl = URL.createObjectURL(file);
  showPreview(previewUrl, file.name);
  msg.textContent = t("image_ready");
});

removePhoto.addEventListener("click", () => {
  clearPreviewUrl();
  currentImagePath = "";
  photoInput.value = "";
  showPreview("");
});

retryUpload.addEventListener("click", () => form.requestSubmit());

async function render() {
  list.setAttribute("aria-busy", "true");
  const products = await api.getProducts(auth.getBoundStoreId());
  list.removeAttribute("aria-busy");
  if (!products.length) {
    list.innerHTML = `<p class="empty">${t("no_products")}</p>`;
    return;
  }
  list.innerHTML = products
    .map(
      (product) => `
    <article class="card product-admin-card">
      ${productImageHtml(product.image, product.product_name)}
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
  msg.textContent = "";
  retryUpload.hidden = true;
  const data = Object.fromEntries(new FormData(form).entries());
  const productId = data.product_id || crypto.randomUUID();
  const oldPath = originalImagePath;
  let uploadedPath = "";
  submitBtn.disabled = true;

  if (photoInput.files[0]) {
    progress.hidden = false;
    progress.value = 0;
    const upload = await uploadProductImage(
      photoInput.files[0],
      auth.getBoundStoreId(),
      productId,
      { onProgress: (value) => (progress.value = value) }
    );
    if (!upload.ok) {
      msg.textContent = t(upload.code);
      retryUpload.hidden = false;
      submitBtn.disabled = false;
      return;
    }
    uploadedPath = upload.path;
  }

  data.product_id = productId;
  data.image_path = uploadedPath || currentImagePath || null;
  const result = data.product_id && form.product_id.value
    ? await api.updateProduct(productId, data)
    : await api.createProduct(data);
  if (!result.ok) {
    if (uploadedPath) await deleteProductImage(uploadedPath);
    msg.textContent = result.message || t(result.code || "backend_error");
    submitBtn.disabled = false;
    return;
  }
  if (oldPath && oldPath !== data.image_path) await deleteProductImage(oldPath);
  msg.textContent = t("saved_ok");
  showToast(t("saved_ok"));
  submitBtn.disabled = false;
  resetForm();
  await render();
});

cancelBtn.addEventListener("click", resetForm);

list.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-del]");
  const editButton = event.target.closest("[data-edit]");
  if (!deleteButton && !editButton) return;
  const products = await api.getProducts(auth.getBoundStoreId());
  const productId = (deleteButton || editButton).dataset.del || editButton?.dataset.edit;
  const product = products.find((item) => item.product_id === productId);
  if (!product) return;

  if (deleteButton) {
    if (!confirm(t("confirm_delete_product", { name: product.product_name }))) return;
    deleteButton.disabled = true;
    const result = await api.deleteProduct(product.product_id);
    if (result.ok && result.deleted && result.image_path) {
      await deleteProductImage(result.image_path);
    }
    msg.textContent = result.ok
      ? t(result.hidden ? "product_hidden_history" : "deleted_ok")
      : t(result.code || "backend_error");
    showToast(msg.textContent, result.ok ? "success" : "error");
    if (result.ok && form.product_id.value === product.product_id) resetForm();
    await render();
    return;
  }

  form.product_id.value = product.product_id;
  form.product_name.value = product.product_name;
  form.category.value = product.category;
  form.description.value = product.description;
  form.price.value = product.price;
  form.status.value = product.status;
  currentImagePath = product.image_path || "";
  originalImagePath = currentImagePath;
  showPreview(product.image, product.product_name);
  submitBtn.textContent = t("form_save_product");
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

resetForm();
await render();
