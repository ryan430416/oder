/**
 * 購物車：同一時間只允許一間店（用 store_id 關聯）
 */
import { config } from "./config.js";
import { storage } from "./storage.js";

function emptyCart() {
  return { store_id: "", items: [] };
}

export const cart = {
  get() {
    return storage.get(config.CART_KEY, emptyCart());
  },

  save(c) {
    storage.set(config.CART_KEY, c);
  },

  clear() {
    this.save(emptyCart());
  },

  add(product, qty = 1) {
    const c = this.get();
    if (c.store_id && c.store_id !== product.store_id) {
      return { ok: false, code: "OTHER_STORE" };
    }
    c.store_id = product.store_id;
    const found = c.items.find((i) => i.product_id === product.product_id);
    if (found) found.quantity += qty;
    else {
      c.items.push({
        product_id: product.product_id,
        store_id: product.store_id,
        product_name: product.product_name,
        unit_price: product.price,
        quantity: qty,
      });
    }
    this.save(c);
    return { ok: true, cart: c };
  },

  setQty(productId, quantity) {
    const c = this.get();
    const item = c.items.find((i) => i.product_id === productId);
    if (!item) return c;
    if (quantity <= 0) {
      c.items = c.items.filter((i) => i.product_id !== productId);
    } else {
      item.quantity = quantity;
    }
    if (!c.items.length) c.store_id = "";
    this.save(c);
    return c;
  },

  count() {
    return this.get().items.reduce((s, i) => s + i.quantity, 0);
  },

  total() {
    return this.get().items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  },
};
