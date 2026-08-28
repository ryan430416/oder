function env() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) throw new Error("server_not_configured");
  return { url, serviceKey, anonKey };
}

export async function requireAdmin(request) {
  const { url, serviceKey, anonKey } = env();
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,status`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/vnd.pgrst.object+json",
      },
    }
  );
  if (!profileResponse.ok) return null;
  const profile = await profileResponse.json();
  return profile.role === "admin" && profile.status === "active"
    ? { user, url, serviceKey }
    : null;
}

export async function serviceRequest(path, options = {}) {
  const { url, serviceKey } = env();
  return fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export function reject(response, status, code) {
  response.status(status).json({ ok: false, code });
}
