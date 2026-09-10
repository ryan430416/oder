const AUTH = "oder_users";

function pocketBaseUrl() {
  return String(process.env.POCKETBASE_URL || "").trim().replace(/\/$/, "");
}

export function adminConfigured() {
  return Boolean(
    pocketBaseUrl() && process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD
  );
}

export async function pbFetch(path, { method = "GET", body, token } = {}) {
  const url = pocketBaseUrl();
  if (!url) throw new Error("POCKETBASE_URL missing");
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = String(token).replace(/^Bearer\s+/i, "");
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

let adminCache = { token: "", expires: 0 };

export async function adminToken() {
  if (!adminConfigured()) throw new Error("server_not_configured");
  if (adminCache.token && Date.now() < adminCache.expires) return adminCache.token;
  const attempts = [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ];
  for (const path of attempts) {
    const result = await pbFetch(path, {
      method: "POST",
      body: {
        identity: process.env.POCKETBASE_ADMIN_EMAIL,
        password: process.env.POCKETBASE_ADMIN_PASSWORD,
      },
    });
    if (result.ok && result.data.token) {
      adminCache = { token: result.data.token, expires: Date.now() + 10 * 60 * 1000 };
      return result.data.token;
    }
  }
  throw new Error("server_not_configured");
}

export async function adminFetch(path, options = {}) {
  const token = await adminToken();
  const result = await pbFetch(path, { ...options, token });
  if (result.status === 401) {
    adminCache = { token: "", expires: 0 };
    const retryToken = await adminToken();
    return pbFetch(path, { ...options, token: retryToken });
  }
  return result;
}

export async function authFromHeader(authorization) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const result = await pbFetch(`/api/collections/${AUTH}/auth-refresh`, {
    method: "POST",
    token,
  });
  if (!result.ok || !result.data.record) return null;
  return { token: result.data.token || token, record: result.data.record };
}

export async function findFirst(collection, filter) {
  const result = await adminFetch(
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=1`
  );
  if (!result.ok) return null;
  return result.data.items?.[0] || null;
}

export async function findAll(collection, filter) {
  const query = filter ? `?filter=${encodeURIComponent(filter)}&perPage=200` : "?perPage=200";
  const result = await adminFetch(`/api/collections/${collection}/records${query}`);
  if (!result.ok) return [];
  return result.data.items || [];
}

export async function findById(collection, id) {
  if (!id) return null;
  const result = await adminFetch(`/api/collections/${collection}/records/${id}`);
  return result.ok ? result.data : null;
}

export async function createRecord(collection, body) {
  const result = await adminFetch(`/api/collections/${collection}/records`, {
    method: "POST",
    body,
  });
  if (!result.ok) throw new Error(result.data?.message || "create_failed");
  return result.data;
}

export async function updateRecord(collection, id, body) {
  const result = await adminFetch(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body,
  });
  if (!result.ok) throw new Error(result.data?.message || "update_failed");
  return result.data;
}

export async function deleteRecord(collection, id) {
  const result = await adminFetch(`/api/collections/${collection}/records/${id}`, {
    method: "DELETE",
  });
  if (!result.ok && result.status !== 404) throw new Error(result.data?.message || "delete_failed");
  return result.ok;
}
