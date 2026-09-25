import test from "node:test";
import assert from "node:assert/strict";
import { quoteLine, lineId, itemDisplayName } from "../js/variants.js";

const product = { id: "p1", status: "active", price: 50, product_name: "便當" };
const variants = [
  { id: "small", name: "小份", price: 50, sort: 1, status: "active" },
  { id: "large", name: "大份", price: 70, sort: 0, status: "active" },
  { id: "off", name: "隱藏", price: 1, sort: 2, status: "disabled" },
];

test("legacy products keep a single database price and ignore the client price", () => {
  const quoted = quoteLine({ product, variants: [], variantId: "", clientPrice: 1 });
  assert.equal(quoted.ok, true);
  assert.equal(quoted.unit, 50);
  assert.equal(quoted.variantName, "");
  assert.equal(quoteLine({ product, variants: [], variantId: "x" }).code, "invalid_items");
});

test("a product with sizes requires one active size and uses that database price", () => {
  assert.equal(quoteLine({ product, variants, variantId: "" }).code, "need_variant");
  assert.equal(quoteLine({ product, variants, variantId: "off" }).code, "need_variant");
  const large = quoteLine({ product, variants, variantId: "large", clientPrice: 1 });
  assert.equal(large.unit, 70);
  assert.equal(large.variantName, "大份");
  assert.equal(lineId("p1", "large"), "p1::large");
  assert.equal(lineId("p1", ""), "p1");
  assert.equal(itemDisplayName({ product_name: "便當", variant_name: "大份" }), "便當（大份）");
});
