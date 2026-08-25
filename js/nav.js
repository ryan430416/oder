/** 三端共用導航與購物車數量 */

export function qs(sel, root = document) {
  return root.querySelector(sel);
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
