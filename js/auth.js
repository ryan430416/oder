/**
 * 身分與權限
 * 店家 store_id 一律從登入使用者讀取，不接受前端自行指定
 */
import { config } from "./config.js";
import { storage } from "./storage.js";
import { getDb, saveDb } from "./mock/db.js";

export const auth = {
  getSession() {
    return storage.get(config.SESSION_KEY, null);
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
    const user = getDb().Users.find((u) => u.user_id === s.user_id);
    return (user && user.store_id) || "";
  },

  login(username, password) {
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
      role: user.role,
      store_id: user.store_id || "",
    };
    storage.set(config.SESSION_KEY, session);
    return { ok: true, session };
  },

  logout() {
    storage.remove(config.SESSION_KEY);
  },

  /** 顧客端：沒登入才用示範學生。管理員／店家進顧客頁時不覆蓋原登入 */
  ensureCustomer() {
    const s = this.getSession();
    if (s && s.role === "customer") return s;
    const db = getDb();
    const user = db.Users.find((u) => u.user_id === "user_c001");
    const guest = {
      user_id: user.user_id,
      name: user.name,
      role: "customer",
      store_id: "",
    };
    if (s && (s.role === "admin" || s.role === "store")) return guest;
    storage.set(config.SESSION_KEY, guest);
    return guest;
  },

  setCustomerName(name) {
    const n = String(name || "").trim();
    if (!n) return { ok: false, code: "need_name" };
    const live = this.getSession();
    if (live && (live.role === "admin" || live.role === "store")) {
      return { ok: true, session: { user_id: "user_c001", name: n, role: "customer", store_id: "" } };
    }
    const s = this.ensureCustomer();
    const db = getDb();
    const user = db.Users.find((u) => u.user_id === s.user_id);
    if (user) user.name = n;
    saveDb(db);
    const session = { ...s, name: n, role: "customer" };
    storage.set(config.SESSION_KEY, session);
    return { ok: true, session };
  },
};
