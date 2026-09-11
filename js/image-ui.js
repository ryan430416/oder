import { DEFAULT_PRODUCT_IMAGE } from "./html.js";
import { IMAGE_LIMITS, isUsableImageDimension } from "./product-image.js";
import { t } from "./i18n.js";

export function applyProductImageFallback(image) {
  if (!image) return image;
  const fallback = image.dataset?.defaultSrc || DEFAULT_PRODUCT_IMAGE;
  if (image.dataset.fallbackApplied === "1") return image;
  image.dataset.fallbackApplied = "1";
  if (typeof image.removeAttribute === "function") image.removeAttribute("src");
  if (typeof image.setAttribute === "function") image.setAttribute("src", fallback);
  else image.src = fallback;
  const button = typeof image.closest === "function" ? image.closest(".product-image-button") : null;
  if (button?.parentNode) {
    button.replaceWith(image);
  }
  return image;
}

function inspectLoadedPhoto(image) {
  if (!image || image.dataset.fallbackApplied === "1") return;
  const width = image.naturalWidth || 0;
  const height = image.naturalHeight || 0;
  if (!isUsableImageDimension(width, height) || width < IMAGE_LIMITS.minEdge || height < IMAGE_LIMITS.minEdge) {
    applyProductImageFallback(image);
  }
}

function clearLightboxImage(image) {
  if (!image) return;
  image.removeAttribute("src");
  image.alt = "";
  image.hidden = true;
}

export function mountImageUi(root = document) {
  root.querySelectorAll("img.product-photo").forEach((image) => {
    if (image.dataset.imageReady) return;
    image.dataset.imageReady = "1";
    const src = image.getAttribute("src");
    if (!src) {
      applyProductImageFallback(image);
      return;
    }
    image.addEventListener("error", () => applyProductImageFallback(image));
    if (image.complete) {
      inspectLoadedPhoto(image);
    } else {
      image.addEventListener("load", () => inspectLoadedPhoto(image), { once: true });
    }
  });

  if (document.body.dataset.imageLightbox) return;
  document.body.dataset.imageLightbox = "1";
  const dialog = document.createElement("dialog");
  dialog.className = "image-lightbox";
  dialog.setAttribute("aria-label", t("product_photo_alt"));
  const closeButton = document.createElement("button");
  closeButton.className = "btn";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  const preview = document.createElement("img");
  preview.hidden = true;
  preview.alt = "";
  dialog.append(closeButton, preview);
  document.body.append(dialog);

  const closeDialog = () => {
    clearLightboxImage(preview);
    if (dialog.open) dialog.close();
  };

  closeButton.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("close", () => clearLightboxImage(preview));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) closeDialog();
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image-preview]");
    if (!trigger) return;
    const src = String(trigger.dataset.imagePreview || "").trim();
    if (!src) return;
    preview.hidden = false;
    preview.alt = trigger.getAttribute("aria-label") || t("product_photo_alt");
    preview.src = src;
    preview.onerror = () => closeDialog();
    dialog.showModal();
    closeButton.focus();
  });
}
