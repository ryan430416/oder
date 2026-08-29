import { t } from "./i18n.js";

/** Escape untrusted text before placing it inside an HTML template. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[char];
  });
}

export const escapeAttr = escapeHtml;

export const DEFAULT_PRODUCT_IMAGE = new URL("../images/default-meal.svg", import.meta.url).href;

function usableProductImage(image) {
  return /^(https:\/\/|blob:)/i.test(String(image ?? "").trim());
}

export function productImageSrc(image) {
  const value = String(image ?? "").trim();
  return usableProductImage(value) ? value : DEFAULT_PRODUCT_IMAGE;
}

export function productImageHtml(image, alt = "") {
  const altText = String(alt ?? "").trim() || t("product_photo_alt");
  const src = productImageSrc(image);
  const fallback = DEFAULT_PRODUCT_IMAGE;
  const img = `<img class="product-photo" src="${escapeAttr(src)}" alt="${escapeAttr(altText)}" loading="lazy" data-default-src="${escapeAttr(fallback)}" />`;
  if (usableProductImage(image) && src !== fallback) {
    return `<button class="product-image-button" type="button" data-image-preview="${escapeAttr(src)}" aria-label="${escapeAttr(altText)}">${img}</button>`;
  }
  return img;
}
