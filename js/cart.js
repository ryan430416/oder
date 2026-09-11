/**
 * 購物車：同一時間只允許一間店（用 store_id 關聯）
 */
import { config } from "./config.js";
import { storage } from "./storage.js";
import { parseCartQuantity, QTY_MAX, QTY_MIN } from "./quantity.js";

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
    const amount = parseOrderLike(qty);
    if ((product.status && product.status !== "active") || amount == null) {
      return { ok: false, code: "INVALID_QUANTITY" };
    }
    const c = this.get();
    if (c.store_id && c.store_id !== product.store_id) {
      return { ok: false, code: "OTHER_STORE" };
    }
    c.store_id = product.store_id;
    const found = c.items.find((i) => i.product_id === product.product_id);
    if (found && found.quantity + amount > QTY_MAX) {
      return { ok: false, code: "INVALID_QUANTITY" };
    }
    if (found) found.quantity += amount;
    else {
      c.items.push({
        product_id: product.product_id,
        store_id: product.store_id,
        product_name: product.product_name,
        unit_price: product.price,
        quantity: amount,
      });
    }
    this.save(c);
    return { ok: true, cart: c };
  },

  /**
   * Set line quantity. Empty input does not delete the line.
   * Values are clamped to 1–99 when parseable; invalid input is rejected.
   */
  setQty(productId, quantity) {
    const c = this.get();
    const item = c.items.find((i) => i.product_id === productId);
    if (!item) return { ok: false, cart: c };
    const parsed = parseCartQuantity(quantity, { clamp: true });
    if (parsed.empty) return { ok: false, empty: true, cart: c, quantity: item.quantity };
    if (!parsed.ok) return { ok: false, code: "INVALID_QUANTITY", cart: c, quantity: item.quantity };
    item.quantity = parsed.value;
    this.save(c);
    return { ok: true, cart: c, quantity: parsed.value, clamped: parsed.clamped };
  },

  remove(productId) {
    const c = this.get();
    c.items = c.items.filter((i) => i.product_id !== productId);
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

function parseOrderLike(qty) {
  if (typeof qty === "number") {
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < QTY_MIN || qty > QTY_MAX) return null;
    return qty;
  }
  const parsed = parseCartQuantity(qty, { clamp: false });
  return parsed.ok ? parsed.value : null;
}
