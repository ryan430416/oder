/** 三端共用導航與購物車數量 */

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

/** Same-folder page URL that still works if the host stripped `.html` or the trailing slash. */
export function pageHref(file, base = location.href) {
  const url = new URL(base);
  let path = url.pathname;
  if (!path.endsWith("/")) {
    const last = path.split("/").pop() || "";
    if (last.includes(".") || last === "index") path = path.slice(0, -last.length);
    else path += "/";
  }
  return new URL(file, `${url.origin}${path}`).href;
}

export function goToPage(file) {
  location.href = pageHref(file);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function setCartBadge(el) {
  if (!el) return;
  import("./cart.js").then(({ cart }) => {
    const n = cart.count();
    el.textContent = n;
    el.hidden = n === 0;
  });
}

export function bindSearch(input, onChange) {
  if (!input) return;
  input.addEventListener("input", () => onChange(input.value.trim().toLowerCase()));
}
