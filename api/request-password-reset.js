import { serviceRequest } from "../server/supabase-admin.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false });
  const username = String(request.body?.username || "").trim().toLowerCase().slice(0, 100);
  if (!username) return response.status(200).json({ ok: true });
  const email = username.includes("@") ? username : `${username}@campus-order.test`;

  const usersResponse = await serviceRequest("/auth/v1/admin/users?page=1&per_page=1000");
  if (usersResponse.ok) {
    const users = (await usersResponse.json()).users || [];
    const user = users.find((item) => item.email?.toLowerCase() === email);
    if (user) {
      const profileResponse = await serviceRequest(
        `/rest/v1/profiles?id=eq.${user.id}&role=eq.store&select=store_id,display_name`,
        { headers: { Accept: "application/vnd.pgrst.object+json" } }
      );
      if (profileResponse.ok) {
        const profile = await profileResponse.json();
        const adminsResponse = await serviceRequest(
          "/rest/v1/profiles?role=eq.admin&status=eq.active&select=id"
        );
        const admins = adminsResponse.ok ? await adminsResponse.json() : [];
        if (admins.length) {
          await serviceRequest("/rest/v1/notifications", {
            method: "POST",
            body: JSON.stringify(
              admins.map((admin) => ({
                user_id: admin.id,
                store_id: profile.store_id,
                type: "password_reset",
                message: `${profile.display_name || username} 申請重設密碼`,
              }))
            ),
          });
        }
      }
    }
  }
  // Always return the same response to avoid account enumeration.
  response.status(200).json({ ok: true });
}
