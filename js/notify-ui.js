import { api } from "./api.js";
import { t } from "./i18n.js";
import { escapeAttr } from "./html.js";

export async function mountBell(host, pageHref) {
  if (!host) return;
  const notes = await api.getNotifications();
  const unread = notes.filter((n) => !n.read).length;
  host.innerHTML = `<a class="bell" href="${escapeAttr(pageHref)}" title="${escapeAttr(t("nav_notice"))}">🔔${
    unread ? `<span class="cart-count">${unread}</span>` : ""
  }</a>`;
}

export function noteText(n) {
  return t(n.key || "nav_notice", n.vars || {});
}
