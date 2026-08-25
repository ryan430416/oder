import { auth } from "../auth.js";
import { qs } from "../nav.js";

const s = auth.getSession();
if (s && s.role === "store") location.href = "dashboard.html";

qs("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = auth.login(fd.get("username"), fd.get("password"));
  if (!res.ok) {
    qs("#err").textContent = res.message;
    return;
  }
  if (res.session.role !== "store") {
    auth.logout();
    qs("#err").textContent = "此帳號不是店家角色";
    return;
  }
  location.href = "dashboard.html";
});
