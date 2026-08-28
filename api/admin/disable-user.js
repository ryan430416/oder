import { reject, requireAdmin, serviceRequest } from "../../server/supabase-admin.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return reject(response, 405, "method_not_allowed");
  const admin = await requireAdmin(request);
  if (!admin) return reject(response, 403, "not_admin");
  const userId = String(request.body?.user_id || "");
  if (!userId || userId === admin.user.id) return reject(response, 400, "cannot_delete_admin");

  const profileResponse = await serviceRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "disabled" }),
  });
  if (!profileResponse.ok) return reject(response, 400, "no_user");
  const rows = await profileResponse.json();
  if (!rows.length) return reject(response, 404, "no_user");
  response.status(200).json({ ok: true, user_id: userId });
}
