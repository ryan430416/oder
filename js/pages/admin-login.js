import { auth } from "../auth.js";
import { qs, goToPage } from "../nav.js";
import { initI18n, t } from "../i18n.js";
import { mountPasswordToggles } from "../password-toggle.js";
import { config, loadConfig } from "../config.js";

initI18n();
mountPasswordToggles();
await loadConfig();
document.querySelector(".hint").hidden = !config.SHOW_TEST_ACCOUNT;
if (new URLSearchParams(location.search).get("reason") === "session_expired") {
  qs("#err").textContent = t("session_expired");
}
const s = await auth.restoreSession();
if (s && s.role === "admin") goToPage("dashboard.html");

qs("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const button = e.target.querySelector("button[type=submit]");
  button.disabled = true;
  const res = await auth.login(fd.get("username"), fd.get("password"));
  button.disabled = false;
  if (!res.ok) {
    qs("#err").textContent = t(res.code);
    return;
  }
  if (res.session.role !== "admin") {
    await auth.logout();
    qs("#err").textContent = t("not_admin");
    return;
  }
  goToPage("dashboard.html");
});
