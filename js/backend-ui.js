import { t } from "./i18n.js";

const FRIENDLY_CODES = new Set([
  "backend_error",
  "backend_offline",
  "supabase_not_configured",
  "stores_load_failed",
  "cart_load_failed",
]);

export function friendlyErrorCode(code) {
  return FRIENDLY_CODES.has(code) ? code : "backend_error";
}

export function renderBackendNotice(host, { code, onRetry, busy = false } = {}) {
  if (!host) return null;
  host.hidden = false;
  host.className = "notice error";
  host.setAttribute("role", "alert");
  host.replaceChildren();
  const text = document.createElement("p");
  text.textContent = t(friendlyErrorCode(code));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = t("retry");
  button.disabled = Boolean(busy);
  button.addEventListener("click", () => {
    if (button.disabled) return;
    onRetry?.();
  });
  host.append(text, button);
  return button;
}

export function hideBackendNotice(host) {
  if (!host) return;
  host.hidden = true;
  host.removeAttribute("role");
  host.replaceChildren();
}
