import { auth } from "./auth.js";
import { initI18n } from "./i18n.js";
import { goToPage } from "./nav.js";

/** 管理頁共用：登入檢查、翻譯、登出 */
export async function bootAdmin() {
  initI18n();
  const s = await auth.requireRole("admin", "index.html");
  if (!s || s.role !== "admin") {
    return null;
  }
  document.querySelectorAll("#logout").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await auth.logout();
      goToPage("index.html");
    });
  });
  return s;
}
