import { reject, requireAdmin, serviceRequest } from "../../server/supabase-admin.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return reject(response, 405, "method_not_allowed");
  if (!(await requireAdmin(request))) return reject(response, 403, "not_admin");

  const { store_id: storeId, username, password, display_name: displayName } = request.body || {};
  const login = String(username || "").trim().toLowerCase();
  if (!storeId || !login || String(password || "").length < 4) {
    return reject(response, 400, "invalid_account");
  }
  const email = login.includes("@") ? login : `${login}@campus-order.test`;
  const createdResponse = await serviceRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { display_name: String(displayName || "").slice(0, 80) },
    }),
  });
  if (!createdResponse.ok) return reject(response, 400, "username_taken");
  const user = await createdResponse.json();

  const profileResponse = await serviceRequest(`/rest/v1/profiles?id=eq.${user.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      display_name: String(displayName || "").slice(0, 80),
      role: "store",
      store_id: storeId,
      status: "active",
    }),
  });
  if (!profileResponse.ok) {
    await serviceRequest(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    return reject(response, 500, "backend_error");
  }
  response.status(200).json({ ok: true, user_id: user.id, username: login });
}
