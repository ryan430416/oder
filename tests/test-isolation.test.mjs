import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deletionAllowed, matchingDeletetestAccounts } from "../scripts/cleanup-deletetest-accounts.mjs";
import { isolatedPocketBaseUrl, isProductionPocketBaseUrl } from "./pocketbase-test-env.mjs";

test("automatic tests cannot target the school PocketBase", async () => {
  assert.equal(isProductionPocketBaseUrl("https://db.keson.pro"), true);
  assert.equal(isolatedPocketBaseUrl({ POCKETBASE_TEST_URL: "https://db.keson.pro" }), "");
  assert.equal(
    isolatedPocketBaseUrl({
      POCKETBASE_URL: "https://db.keson.pro",
      POCKETBASE_TEST_URL: "https://db.keson.pro",
    }),
    ""
  );
  assert.equal(
    isolatedPocketBaseUrl({ POCKETBASE_TEST_URL: "http://127.0.0.1:8091" }),
    "http://127.0.0.1:8091"
  );
  const rules = await readFile(new URL("./pocketbase-rules.integration.test.mjs", import.meta.url), "utf8");
  assert.match(rules, /isolatedPocketBaseUrl/);
  assert.match(rules, /if \(url\) process\.env\.POCKETBASE_URL = url/);
  assert.doesNotMatch(rules, /env\.POCKETBASE_URL \|\| process\.env\.POCKETBASE_URL/);
  const e2e = await readFile(new URL("./e2e/ordering-flow.spec.js", import.meta.url), "utf8");
  assert.match(e2e, /oder-seven/);
  assert.match(e2e, /keson/);
});

test("deletetest cleanup lists only the test prefix and refuses without confirmation", () => {
  const matches = matchingDeletetestAccounts([
    { email: "guest_deletetest_1@campus-order.test" },
    { email: "guest_real_user@campus-order.test" },
    { email: "admin@campus-order.test" },
  ]);
  assert.deepEqual(
    matches.map((item) => item.email),
    ["guest_deletetest_1@campus-order.test"]
  );
  assert.equal(deletionAllowed([]), false);
  assert.equal(deletionAllowed(["--confirm-delete-deletetest"]), true);
});
