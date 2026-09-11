import { t } from "./i18n.js";

const FRIENDLY_CODES = new Set([
  "backend_error",
  "backend_offline",
  "pocketbase_not_configured",
  "server_not_configured",
  "anonymous_login_failed",
  "stores_load_failed",
  "products_load_failed",
  "cart_load_failed",
  "permission_denied",
  "users_load_failed",
  "orders_load_failed",
  "analytics_load_failed",
  "store_has_orders",
  "store_delete_failed",
  "session_expired",
]);

export function friendlyErrorCode(code) {
  return FRIENDLY_CODES.has(code) ? code : "backend_error";
}

export async function withRetryLock(button, task) {
  if (button) button.disabled = true;
  try {
    await task?.();
  } finally {
    if (button && (button.isConnected !== false)) button.disabled = false;
  }
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
    Promise.resolve(withRetryLock(button, onRetry)).catch(() => {});
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
