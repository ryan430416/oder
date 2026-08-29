import { DEFAULT_PRODUCT_IMAGE } from "./html.js";

export function applyProductImageFallback(image) {
  if (!image) return image;
  const fallback = image.dataset?.defaultSrc || DEFAULT_PRODUCT_IMAGE;
  if (image.dataset.fallbackApplied === "1") return image;
  image.dataset.fallbackApplied = "1";
  image.src = fallback;
  const button = typeof image.closest === "function" ? image.closest(".product-image-button") : null;
  if (button?.parentNode) {
    button.replaceWith(image);
  }
  return image;
}

export function mountImageUi(root = document) {
  root.querySelectorAll("img.product-photo").forEach((image) => {
    if (image.dataset.imageReady) return;
    image.dataset.imageReady = "1";
    if (!image.getAttribute("src")) {
      applyProductImageFallback(image);
      return;
    }
    image.addEventListener("error", () => applyProductImageFallback(image));
  });

  if (document.body.dataset.imageLightbox) return;
  document.body.dataset.imageLightbox = "1";
  const dialog = document.createElement("dialog");
  dialog.className = "image-lightbox";
  dialog.innerHTML = '<button class="btn" type="button" aria-label="Close">×</button><img alt="" />';
  document.body.append(dialog);
  dialog.querySelector("button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image-preview]");
    if (!trigger) return;
    const image = dialog.querySelector("img");
    image.src = trigger.dataset.imagePreview;
    image.alt = trigger.getAttribute("aria-label") || "";
    dialog.showModal();
  });
}
