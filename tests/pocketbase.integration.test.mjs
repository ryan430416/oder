import test from "node:test";
import assert from "node:assert/strict";
import { isolatedPocketBaseUrl } from "./pocketbase-test-env.mjs";

const url = isolatedPocketBaseUrl();
const integration = url ? test : test.skip;

integration("PocketBase health endpoint is reachable", async () => {
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.ok, true, await response.text());
});

integration("guests cannot create product records", async () => {
  const response = await fetch(`${url}/api/collections/products/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "blocked",
      category: "其他",
      price: 1,
      status: "active",
    }),
  });
  assert.equal(response.ok, false);
  assert.ok([400, 401, 403].includes(response.status));
});
