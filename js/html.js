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

export function productImageHtml(image, alt = "") {
  const value = String(image || "").trim();
  if (/^(https:\/\/|blob:)/i.test(value)) {
    return `<button class="product-image-button" type="button" data-image-preview="${escapeAttr(value)}" aria-label="${escapeAttr(alt)}"><img class="product-photo" src="${escapeAttr(value)}" alt="${escapeAttr(alt)}" loading="lazy" /></button>`;
  }
  return `<div class="product-photo product-photo-placeholder" role="img" aria-label="${escapeAttr(alt)}"><span>No image</span></div>`;
}
