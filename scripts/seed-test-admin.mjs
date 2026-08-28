const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appEnv = process.env.APP_ENV || "development";
const username = process.env.TEST_ADMIN_USERNAME || "admin";
const password = process.env.TEST_ADMIN_PASSWORD || "1234";

if (!url || !serviceKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
if (appEnv === "production") throw new Error("Refusing to seed a weak test account in production.");

const email = username.includes("@") ? username : `${username}@campus-order.test`;
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const listResponse = await fetch(
  `${url}/auth/v1/admin/users?page=1&per_page=1000`,
  { headers }
);
if (!listResponse.ok) throw new Error(`Unable to list users: ${await listResponse.text()}`);
const users = (await listResponse.json()).users || [];
let user = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "測試管理員" },
    }),
  });
  if (!createResponse.ok) {
    throw new Error(
      `Unable to create test admin. Testing password policy must allow 4 characters: ${await createResponse.text()}`
    );
  }
  user = await createResponse.json();
} else {
  const updateResponse = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!updateResponse.ok) {
    throw new Error(`Unable to reset test admin password: ${await updateResponse.text()}`);
  }
}

const profileResponse = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}`, {
  method: "PATCH",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({
    display_name: "測試管理員",
    role: "admin",
    store_id: null,
    status: "active",
  }),
});
if (!profileResponse.ok) throw new Error(`Unable to update admin profile: ${await profileResponse.text()}`);

console.log(`Test admin ready: ${username} (${user.id})`);
