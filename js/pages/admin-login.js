import { auth } from "../auth.js";
import { qs } from "../nav.js";

const s = auth.getSession();
if (s && s.role === "admin") location.href = "dashboard.html";

qs("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = auth.login(fd.get("username"), fd.get("password"));
  if (!res.ok) {
    qs("#err").textContent = res.message;
    return;
  }
  if (res.session.role !== "admin") {
    auth.logout();
    qs("#err").textContent = "此帳號不是管理員";
    return;
  }
  location.href = "dashboard.html";
});
