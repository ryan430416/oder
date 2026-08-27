/**
 * 身分與權限
 * 店家 store_id 一律從登入使用者讀取，不接受前端自行指定
 */
import { config } from "./config.js";
import { storage } from "./storage.js";
import { getDb, saveDb } from "./mock/db.js";
import { rpc } from "./supabase.js";

const CUSTOMER_GRADES = new Set(["high_1", "high_2", "high_3"]);

function getGuest() {
  let guest = storage.get(config.GUEST_KEY, null);
  if (guest?.expires_at && new Date(guest.expires_at).getTime() <= Date.now()) {
    storage.remove(config.GUEST_KEY);
    guest = null;
  }
  if (!guest) {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    guest = { user_id: `guest_${id}`, name: "學生小明", grade: "", role: "customer", store_id: "" };
  }
  if (guest.grade == null) guest.grade = "";
  storage.set(config.GUEST_KEY, guest);
  return guest;
}

export const auth = {
  getSession() {
    const value = storage.get(config.SESSION_KEY, null);
    if (value?.expires_at && new Date(value.expires_at).getTime() <= Date.now()) {
      storage.remove(config.SESSION_KEY);
      if (value.role === "customer") storage.remove(config.GUEST_KEY);
      return null;
    }
    return value;
  },

  requireRole(role, loginHref) {
    const s = this.getSession();
    if (!s || s.role !== role) {
      window.location.href = loginHref;
      throw new Error("需要登入");
    }
    return s;
  },

  /**
   * 店家綁定的真正 store_id（唯一權限來源）
   */
  getBoundStoreId() {
    const s = this.getSession();
    if (!s || s.role !== "store") return "";
    if (s.store_id) return s.store_id;
    if (!config.USE_MOCK) return "";
    const user = getDb().Users.find((u) => u.user_id === s.user_id);
    return (user && user.store_id) || "";
  },

  async login(username, password) {
    if (!config.USE_MOCK) {
      const result = await rpc("demo_login", {
        p_username: String(username || "").trim(),
        p_password: String(password || ""),
      });
      if (result?.ok) storage.set(config.SESSION_KEY, result.session);
      return result;
    }
    const db = getDb();
    const acc = db.Accounts.find(
      (a) => a.username === username.trim() && a.password === password
    );
    if (!acc) return { ok: false, code: "bad_login" };
    const user = db.Users.find((u) => u.user_id === acc.user_id);
    if (!user || user.status !== "active") {
      return { ok: false, code: "disabled" };
    }
    const session = {
      user_id: user.user_id,
      name: user.name,
      grade: user.grade || "",
      role: user.role,
      store_id: user.store_id || "",
    };
    storage.set(config.SESSION_KEY, session);
    return { ok: true, session };
  },

  logout() {
    const token = this.getSession()?.token;
    storage.remove(config.SESSION_KEY);
    if (!config.USE_MOCK && token) rpc("demo_logout", { p_token: token });
  },

  /** 顧客端：沒登入才用示範學生。管理員／店家進顧客頁時不覆蓋原登入 */
  ensureCustomer() {
    const s = this.getSession();
    if (s && s.role === "customer") return s;
    if (!config.USE_MOCK) {
      const guest = getGuest();
      if (s && (s.role === "admin" || s.role === "store")) return guest;
      storage.set(config.SESSION_KEY, guest);
      return guest;
    }
    const db = getDb();
    const user = db.Users.find((u) => u.user_id === "user_c001");
    const guest = {
      user_id: user.user_id,
      name: user.name,
      grade: user.grade || "",
      role: "customer",
      store_id: "",
    };
    if (s && (s.role === "admin" || s.role === "store")) return guest;
    storage.set(config.SESSION_KEY, guest);
    return guest;
  },

  setCustomerName(name) {
    return this.setCustomerProfile(name, this.ensureCustomer().grade || "");
  },

  setCustomerProfile(name, grade) {
    const n = String(name || "").trim();
    const g = String(grade || "").trim();
    if (!n) return { ok: false, code: "need_name" };
    if (!g) return { ok: false, code: "need_grade" };
    if (!CUSTOMER_GRADES.has(g)) return { ok: false, code: "invalid_grade" };
    const live = this.getSession();
    if (live && (live.role === "admin" || live.role === "store")) {
      const session = { ...getGuest(), name: n, grade: g };
      storage.set(config.GUEST_KEY, session);
      return { ok: true, session };
    }
    const s = this.ensureCustomer();
    if (!config.USE_MOCK) {
      const session = { ...s, name: n, grade: g, role: "customer" };
      storage.set(config.GUEST_KEY, session);
      storage.set(config.SESSION_KEY, session);
      return { ok: true, session };
    }
    const db = getDb();
    const user = db.Users.find((u) => u.user_id === s.user_id);
    if (user) {
      user.name = n;
      user.grade = g;
    }
    saveDb(db);
    const session = { ...s, name: n, grade: g, role: "customer" };
    storage.set(config.SESSION_KEY, session);
    return { ok: true, session };
  },
};
