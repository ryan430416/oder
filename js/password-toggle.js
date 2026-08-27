import { t } from "./i18n.js";

export function mountPasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.passwordToggle) return;
    input.dataset.passwordToggle = "1";

    const label = document.createElement("label");
    label.className = "password-show";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-controls", input.id || "");

    const text = document.createElement("span");
    text.textContent = t("show_password");

    checkbox.addEventListener("change", () => {
      input.type = checkbox.checked ? "text" : "password";
      text.textContent = t(checkbox.checked ? "hide_password" : "show_password");
    });

    label.append(checkbox, text);
    input.insertAdjacentElement("afterend", label);
  });
}
