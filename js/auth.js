/**
 * 身分與權限
 * 店家 store_id 一律從登入使用者讀取，不接受前端自行指定
 */
import { config } from "./config.js";
import { storage } from "./storage.js";
import { getDb } from "./mock/db.js";

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
    return s.store_id || "";
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

  /** 顧客端：未登入則自動使用示範學生帳號，方便第一階段體驗 */
  ensureCustomer() {
    let s = this.getSession();
    if (s && s.role === "customer") return s;
    const db = getDb();
    const user = db.Users.find((u) => u.user_id === "user_c001");
    const session = {
      user_id: user.user_id,
      name: user.name,
      role: "customer",
      store_id: "",
    };
    storage.set(config.SESSION_KEY, session);
    return session;
  },
};
