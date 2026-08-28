import { getSupabase, rpc } from "./supabase.js";
import { pageHref } from "./nav.js";

const PROFILE_KEY = "campus_order_profile";
const CUSTOMER_GRADES = new Set(["high_1", "high_2", "high_3"]);
let profileCache;

function readProfile() {
  if (profileCache !== undefined) return profileCache;
  try {
    profileCache = JSON.parse(sessionStorage.getItem(PROFILE_KEY)) || null;
  } catch {
    profileCache = null;
  }
  return profileCache;
}

function writeProfile(profile) {
  profileCache = profile || null;
  if (profile) sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  else sessionStorage.removeItem(PROFILE_KEY);
  return profileCache;
}

function loginEmail(username) {
  const value = String(username || "").trim().toLowerCase();
  return value.includes("@") ? value : `${value}@campus-order.test`;
}

async function loadProfile(userId) {
  const client = await getSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, grade, role, store_id, status")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data || data.status !== "active") return null;
  return writeProfile({
    user_id: data.id,
    name: data.display_name || "",
    grade: data.grade || "",
    role: data.role,
    store_id: data.store_id || "",
  });
}

export const auth = {
  getSession() {
    return readProfile();
  },

  async restoreSession() {
    const client = await getSupabase();
    const { data } = await client.auth.getSession();
    if (!data.session?.user) {
      writeProfile(null);
      return null;
    }
    return loadProfile(data.session.user.id);
  },

  async requireRole(role, loginHref) {
    const current = await this.restoreSession();
    if (!current || current.role !== role) {
      writeProfile(null);
      const target = new URL(pageHref(loginHref));
      target.searchParams.set("reason", "session_expired");
      location.replace(target.href);
      return null;
    }
    return current;
  },

  getBoundStoreId() {
    const current = readProfile();
    return current?.role === "store" ? current.store_id || "" : "";
  },

  async login(username, password) {
    try {
      const client = await getSupabase();
      const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail(username),
        password: String(password || ""),
      });
      if (error || !data.user) return { ok: false, code: "bad_login" };
      const profile = await loadProfile(data.user.id);
      if (!profile) {
        await client.auth.signOut();
        return { ok: false, code: "disabled" };
      }
      return { ok: true, session: profile };
    } catch (error) {
      console.error("Supabase login failed", error);
      return { ok: false, code: "backend_error" };
    }
  },

  async logout() {
    writeProfile(null);
    try {
      const client = await getSupabase();
      await client.auth.signOut();
    } catch {
      // Local profile is already cleared.
    }
  },

  async ensureCustomer() {
    let current = await this.restoreSession();
    if (current) return current;
    try {
      const client = await getSupabase();
      const anonymous = await client.auth.signInAnonymously({
        options: { data: { display_name: "" } },
      });
      if (anonymous.data?.user) return loadProfile(anonymous.data.user.id);

      const guest = await rpc("create_guest_login");
      if (!guest?.ok) throw new Error(guest?.code || "anonymous_login_failed");
      const { data, error } = await client.auth.signInWithPassword({
        email: guest.email,
        password: guest.password,
      });
      if (error || !data.user) throw error || new Error("anonymous_login_failed");
      return loadProfile(data.user.id);
    } catch (error) {
      console.error("Customer session failed", error);
      return null;
    }
  },

  async setCustomerProfile(name, grade) {
    const displayName = String(name || "").trim();
    const gradeValue = String(grade || "").trim();
    if (!displayName) return { ok: false, code: "need_name" };
    if (!gradeValue) return { ok: false, code: "need_grade" };
    if (!CUSTOMER_GRADES.has(gradeValue)) return { ok: false, code: "invalid_grade" };
    const result = await rpc("update_my_profile", {
      p_display_name: displayName,
      p_grade: gradeValue,
    });
    if (!result?.ok) return result;
    const session = writeProfile({
      ...readProfile(),
      name: result.profile.display_name,
      grade: result.profile.grade,
    });
    return { ok: true, session };
  },
};

getSupabase()
  .then((client) => {
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_DELETED") writeProfile(null);
    });
  })
  .catch(() => {
    // Individual pages surface the setup error.
  });
