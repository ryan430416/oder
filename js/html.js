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
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) {
    return `<img class="product-photo" src="${escapeAttr(value)}" alt="${escapeAttr(alt)}" loading="lazy" />`;
  }
  return `<span class="product-emoji" aria-hidden="true">${escapeHtml(value || "🍽️")}</span>`;
}
