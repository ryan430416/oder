import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const integration = url && anonKey ? test : test.skip;

integration("Supabase catalog is reachable with anon key", async () => {
  const response = await fetch(`${url}/rest/v1/stores?select=id,name,status&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  assert.equal(response.ok, true, await response.text());
});

integration("anonymous users cannot upload product images", async () => {
  const fakePath =
    "123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174001/123e4567-e89b-42d3-a456-426614174002.webp";
  const response = await fetch(`${url}/storage/v1/object/product-images/${fakePath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "image/webp",
    },
    body: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
  });
  assert.equal(response.ok, false);
  assert.ok([400, 401, 403].includes(response.status));
});
