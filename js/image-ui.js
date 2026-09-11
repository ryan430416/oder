import { DEFAULT_PRODUCT_IMAGE } from "./html.js";
import { IMAGE_LIMITS } from "./product-image.js";
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
  // Only reject broken/tiny assets (1×1); list thumbs may be smaller than upload minEdge.
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < IMAGE_LIMITS.minDisplayEdge ||
    height < IMAGE_LIMITS.minDisplayEdge
  ) {
    applyProductImageFallback(image);
  }
}

function setDialogClosedState(dialog) {
  dialog.setAttribute("aria-hidden", "true");
  if ("inert" in dialog) dialog.inert = true;
}

function setDialogOpenState(dialog, label) {
  dialog.setAttribute("aria-hidden", "false");
  if ("inert" in dialog) dialog.inert = false;
  dialog.setAttribute("aria-label", label);
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
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", t("product_photo_alt"));
  setDialogClosedState(dialog);
  const closeButton = document.createElement("button");
  closeButton.className = "btn";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", t("close_preview"));
  closeButton.textContent = "×";
  dialog.append(closeButton);
  document.body.append(dialog);

  let preview = null;
  let lastFocus = null;

  const clearLightboxImage = () => {
    if (preview) {
      preview.onload = null;
      preview.onerror = null;
      preview.remove();
      preview = null;
    }
  };

  const closeDialog = () => {
    clearLightboxImage();
    setDialogClosedState(dialog);
    if (dialog.open) dialog.close();
    const restore = lastFocus;
    lastFocus = null;
    if (restore && typeof restore.focus === "function") {
      try {
        restore.focus();
      } catch {
        /* ignore */
      }
    }
  };

  closeButton.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("close", () => {
    clearLightboxImage();
    setDialogClosedState(dialog);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) closeDialog();
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image-preview]");
    if (!trigger) return;
    const src = String(trigger.dataset.imagePreview || "").trim();
    if (!src) return;
    event.preventDefault();
    clearLightboxImage();
    const label = trigger.getAttribute("aria-label") || t("product_photo_alt");
    preview = document.createElement("img");
    preview.alt = label;
    preview.src = src;
    preview.onerror = () => closeDialog();
    dialog.append(preview);
    lastFocus = trigger;
    setDialogOpenState(dialog, label);
    dialog.showModal();
    closeButton.focus();
  });
}
