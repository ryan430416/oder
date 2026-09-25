import { api } from "../api.js";
import { auth } from "../auth.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { runStorePage } from "../store-boot.js";
import { validatePasswordChange } from "../store-self-service.js";

await runStorePage(async () => {
  qs("#form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());
    const problem = validatePasswordChange({
      currentPassword: data.current_password,
      newPassword: data.new_password,
      confirmPassword: data.confirm_password,
    });
    if (problem) {
      qs("#msg").textContent = t(problem);
      return;
    }
    button.disabled = true;
    const res = await api.changeOwnPassword({
      currentPassword: data.current_password,
      newPassword: data.new_password,
      confirmPassword: data.confirm_password,
    });
    if (!res.ok) {
      button.disabled = false;
      qs("#msg").textContent = t(res.code || "backend_error");
      form.querySelectorAll("input[type=password]").forEach((input) => {
        input.value = "";
      });
      return;
    }
    await auth.logout();
    location.replace("index.html?reason=password_changed");
  });
});
