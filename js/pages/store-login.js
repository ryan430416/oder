import { auth } from "../auth.js";
import { qs } from "../nav.js";
import { initI18n, t } from "../i18n.js";

initI18n();
const s = auth.getSession();
if (s && s.role === "store") location.href = "dashboard.html";

qs("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = auth.login(fd.get("username"), fd.get("password"));
  if (!res.ok) {
    qs("#err").textContent = t(res.code);
    return;
  }
  if (res.session.role !== "store") {
    auth.logout();
    qs("#err").textContent = t("not_store");
    return;
  }
  location.href = "dashboard.html";
});
