import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("order RPC recalculates prices and enforces idempotency", () => {
  assert.match(schema, /unique\s*\(customer_id,\s*idempotency_key\)/i);
  assert.match(schema, /select \* into v_product from public\.products/i);
  assert.match(schema, /v_total := v_total \+ \(v_product\.price \* v_qty\)/i);
  assert.doesNotMatch(schema, /p_total/i);
});

test("database enforces the complete sequential order workflow", () => {
  assert.match(schema, /v_order\.status = 'pending' and p_next_status in \('accepted', 'rejected'\)/);
  assert.match(schema, /v_order\.status = 'accepted' and p_next_status = 'preparing'/);
  assert.match(schema, /v_order\.status = 'preparing' and p_next_status = 'ready'/);
  assert.match(schema, /v_order\.status = 'ready' and p_next_status = 'completed'/);
});

test("RLS scopes products, orders, and notifications", () => {
  for (const table of ["profiles", "stores", "products", "orders", "order_items", "notifications"]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(schema, /store_id = public\.current_store_id\(\)/);
  assert.match(schema, /customer_id = auth\.uid\(\)/);
  assert.match(schema, /grant select on public\.stores, public\.products to anon/i);
  assert.doesNotMatch(schema, /grant (?:insert|update|delete)[^;]+to anon/i);
});

test("Storage policies enforce owner folders and reject oversized/non-image files", () => {
  assert.match(schema, /file_size_limit,\s*allowed_mime_types[\s\S]*1048576/i);
  assert.match(schema, /array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  assert.match(schema, /\(storage\.foldername\(name\)\)\[1\] = public\.current_store_id\(\)::text/);
  assert.match(schema, /product_images_insert_owner[\s\S]*to authenticated/i);
});
