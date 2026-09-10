const url = (process.env.POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const appEnv = process.env.APP_ENV || "development";
const username = process.env.TEST_ADMIN_USERNAME || "admin";
const password = process.env.TEST_ADMIN_PASSWORD || "1234";
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || "";
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || "";

if (appEnv === "production") throw new Error("Refusing to seed a weak test account in production.");

const email = username.includes("@") ? username : `${username}@campus-order.test`;

if (!adminEmail || !adminPassword) {
  console.log(`Test admin is created by PocketBase migrations on first serve: ${email}`);
  console.log("Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD to upsert it via the API.");
  process.exit(0);
}

const authResponse = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
});
if (!authResponse.ok) {
  throw new Error(`Unable to auth PocketBase superuser: ${await authResponse.text()}`);
}
const { token } = await authResponse.json();
const headers = {
  Authorization: token,
  "Content-Type": "application/json",
};

const listResponse = await fetch(
  `${url}/api/collections/oder_users/records?filter=${encodeURIComponent(`email="${email}"`)}`,
  { headers }
);
if (!listResponse.ok) throw new Error(`Unable to list users: ${await listResponse.text()}`);
const listed = await listResponse.json();
const existing = (listed.items || [])[0];
const payload = {
  email,
  password,
  passwordConfirm: password,
  verified: true,
  display_name: "測試管理員",
  name: "測試管理員",
  role: "admin",
  status: "active",
};

if (!existing) {
  const created = await fetch(`${url}/api/collections/oder_users/records`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!created.ok) throw new Error(`Unable to create test admin: ${await created.text()}`);
} else {
  const updated = await fetch(`${url}/api/collections/oder_users/records/${existing.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!updated.ok) throw new Error(`Unable to update test admin: ${await updated.text()}`);
}

console.log(`Test admin ready: ${username}`);
