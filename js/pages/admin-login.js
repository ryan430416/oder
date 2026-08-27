import { auth } from "../auth.js";
import { qs } from "../nav.js";
import { initI18n, t } from "../i18n.js";

initI18n();
const s = auth.getSession();
if (s && s.role === "admin") location.href = "dashboard.html";

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
    auth.logout();
    qs("#err").textContent = t("not_admin");
    return;
  }
  location.href = "dashboard.html";
});
