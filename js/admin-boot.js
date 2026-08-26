import { auth } from "./auth.js";
import { initI18n } from "./i18n.js";

/** 管理頁共用：登入檢查、翻譯、登出 */
export function bootAdmin() {
  initI18n();
  const s = auth.getSession();
  if (!s || s.role !== "admin") {
    location.replace("index.html");
    return null;
  }
  document.querySelectorAll("#logout").forEach((btn) => {
    btn.addEventListener("click", () => {
      auth.logout();
      location.href = "index.html";
    });
  });
  return s;
}
