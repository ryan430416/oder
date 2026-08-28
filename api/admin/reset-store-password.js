import { reject, requireAdmin, serviceRequest } from "../../server/supabase-admin.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return reject(response, 405, "method_not_allowed");
  if (!(await requireAdmin(request))) return reject(response, 403, "not_admin");
  const { store_id: storeId, password } = request.body || {};
  if (!storeId || String(password || "").length < 4) {
    return reject(response, 400, "password_too_short");
  }
  const profileResponse = await serviceRequest(
    `/rest/v1/profiles?store_id=eq.${encodeURIComponent(storeId)}&role=eq.store&select=id`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } }
  );
  if (!profileResponse.ok) return reject(response, 404, "no_user");
  const profile = await profileResponse.json();
  const updateResponse = await serviceRequest(`/auth/v1/admin/users/${profile.id}`, {
    method: "PUT",
    body: JSON.stringify({ password: String(password) }),
  });
  if (!updateResponse.ok) return reject(response, 400, "backend_error");
  response.status(200).json({ ok: true });
}
