import { AUTH_COLLECTION } from "./collections.js";
import { appSend, authRecord, getPocketBase } from "./pocketbase.js";
import { loginAsGuest } from "./guest-session.js";
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

function loadProfileFromRecord(data) {
  if (!data || data.status !== "active") return writeProfile(null);
  return writeProfile({
    user_id: data.id,
    name: data.display_name || data.name || "",
    grade: data.grade || "",
    role: data.role,
    store_id: data.store || "",
  });
}

export const auth = {
  getSession() {
    return readProfile();
  },

  async restoreSession() {
    const client = await getPocketBase();
    if (!client.authStore.isValid) {
      writeProfile(null);
      return null;
    }
    try {
      await client.collection(AUTH_COLLECTION).authRefresh();
    } catch {
      client.authStore.clear();
      writeProfile(null);
      return null;
    }
    return loadProfileFromRecord(authRecord(client));
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
      const client = await getPocketBase();
      await client.collection(AUTH_COLLECTION).authWithPassword(loginEmail(username), String(password || ""));
      const record = authRecord(client);
      if (!record || record.status !== "active") {
        client.authStore.clear();
        return { ok: false, code: record ? "disabled" : "bad_login" };
      }
      return { ok: true, session: loadProfileFromRecord(record) };
    } catch (error) {
      console.error("PocketBase login failed", error);
      return { ok: false, code: error?.status === 400 ? "bad_login" : "backend_error" };
    }
  },

  async logout() {
    writeProfile(null);
    try {
      const client = await getPocketBase();
      client.authStore.clear();
    } catch {
      // Local profile is already cleared.
    }
  },

  async ensureCustomer() {
    try {
      const restored = await this.restoreSession();
      if (restored) return { ok: true, session: restored, reused: true };
      const client = await getPocketBase();
      const result = await loginAsGuest(client);
      if (!result.ok || !result.session) return { ok: false, code: "anonymous_login_failed" };
      return { ok: true, session: loadProfileFromRecord(result.session), reused: result.reused };
    } catch (error) {
      console.error("Customer session failed", error?.status || error?.message || error);
      return { ok: false, code: error?.message === "backend_unavailable" ? "pocketbase_not_configured" : "anonymous_login_failed" };
    }
  },

  async setCustomerProfile(name, grade) {
    const displayName = String(name || "").trim();
    const gradeValue = String(grade || "").trim();
    if (!displayName) return { ok: false, code: "need_name" };
    if (!gradeValue) return { ok: false, code: "need_grade" };
    if (!CUSTOMER_GRADES.has(gradeValue)) return { ok: false, code: "invalid_grade" };
    try {
      const client = await getPocketBase();
      const record = authRecord(client);
      if (!record?.id) return { ok: false, code: "session_expired" };
      const profile = await client.collection(AUTH_COLLECTION).update(record.id, {
        display_name: displayName,
        grade: gradeValue,
      });
      const session = writeProfile({
        ...readProfile(),
        name: profile.display_name || displayName,
        grade: profile.grade || gradeValue,
      });
      return { ok: true, session };
    } catch (error) {
      const fallback = await appSend("/api/app/update-profile", {
        display_name: displayName,
        grade: gradeValue,
      });
      if (!fallback?.ok) return { ok: false, code: fallback?.code || "backend_error" };
      const session = writeProfile({
        ...readProfile(),
        name: fallback.profile?.display_name || displayName,
        grade: fallback.profile?.grade || gradeValue,
      });
      return { ok: true, session };
    }
  },
};

getPocketBase()
  .then((client) => {
    client.authStore.onChange(() => {
      if (!client.authStore.isValid) writeProfile(null);
    });
  })
  .catch(() => {
    // Individual pages surface the setup error.
  });
