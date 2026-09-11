import test from "node:test";
import assert from "node:assert/strict";
import { customerLabel } from "../js/auth.js";
import { setLang, t } from "../js/i18n.js";

const values = new Map([["campus_order_lang", JSON.stringify("zh")]]);
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.sessionStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};

test("customer label uses display name and never blanks", () => {
  assert.equal(customerLabel({ name: "小明" }, "訪客"), "小明");
  assert.equal(customerLabel({ name: "  " }, "訪客"), "訪客");
  assert.equal(customerLabel({ name: "" }, "訪客"), "訪客");
  assert.equal(customerLabel(null, "訪客"), "訪客");
  setLang("zh");
  assert.equal(t("who", { name: customerLabel({ name: "" }, t("guest_name")) }), "目前身分：訪客");
  assert.doesNotMatch(t("who", { name: customerLabel({ name: "" }, t("guest_name")) }), /undefined|null/);
});
