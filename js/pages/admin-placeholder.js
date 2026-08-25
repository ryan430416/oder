import { auth } from "../auth.js";

const s = auth.requireRole("admin", "index.html");
if (!s) {
  /* redirect */
}

const logout = document.getElementById("logout");
if (logout) {
  logout.addEventListener("click", () => {
    auth.logout();
    location.href = "index.html";
  });
}
