import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hooks = await readFile(new URL("../pocketbase/pb_hooks/main.pb.js", import.meta.url), "utf8");
const handlers = await readFile(new URL("../server/app-handlers.js", import.meta.url), "utf8");
const schema = await readFile(
  new URL("../pocketbase/pb_migrations/1700000001_init_collections.js", import.meta.url),
  "utf8"
);

test("orders can be placed any time for today or tomorrow pickup windows", () => {
  assert.match(hooks, /pickupIsWithinOrderWindow/);
  assert.match(handlers, /pickupIsWithinOrderWindow/);
  assert.match(hooks, /24 \* 60 \* 60 \* 1000/);
  assert.match(hooks, /parts\.minute % 5 !== 0/);
  assert.doesNotMatch(hooks, /24 hours/);
});

test("order APIs recalculate prices and enforce idempotency", () => {
  assert.match(schema, /idx_orders_idempotency/);
  assert.match(hooks, /product\.get\("price"\)/);
  assert.match(handlers, /moneyInt\(product\.price\)/);
  assert.match(hooks, /total \+= subtotal/);
  assert.match(handlers, /total \+= subtotal/);
  assert.doesNotMatch(hooks, /body\.total/);
  assert.doesNotMatch(handlers, /body\.total/);
});

test("database enforces the complete sequential order workflow", () => {
  assert.match(hooks, /current === "pending" && \(next === "accepted" \|\| next === "rejected"\)/);
  assert.match(handlers, /canTransition\(order\.status, next\)/);
  assert.match(hooks, /current === "accepted" && next === "preparing"/);
  assert.match(hooks, /current === "preparing" && next === "ready"/);
  assert.match(hooks, /current === "ready" && next === "completed"/);
});

test("collection rules scope products, orders, and notifications", () => {
  for (const name of ["stores", "products", "orders", "order_items", "notifications"]) {
    assert.match(schema, new RegExp(`name: "${name}"`));
  }
  assert.match(schema, /store = @request\.auth\.store/);
  assert.match(schema, /customer = @request\.auth\.id/);
  assert.match(schema, /createRule: null/);
  assert.match(schema, /name: "oder_users"/);
  assert.match(schema, /onlyInt: true/);
});

test("product images are file fields limited to 1MB jpeg png webp", () => {
  assert.match(schema, /maxSize: 1048576/);
  assert.match(schema, /mimeTypes: \["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(schema, /name: "image"/);
  assert.match(schema, /protected: false/);
});
