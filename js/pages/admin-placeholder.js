import { auth } from "../auth.js";
import { initI18n } from "../i18n.js";

initI18n();
auth.requireRole("admin", "index.html");

const logout = document.getElementById("logout");
if (logout) {
  logout.addEventListener("click", () => {
    auth.logout();
    location.href = "index.html";
  });
}
