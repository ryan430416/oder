import { api } from "./api.js";
import { t } from "./i18n.js";
import { escapeAttr } from "./html.js";
import { mountIcons } from "./icons.js";

export async function mountBell(host, pageHref) {
  if (!host) return;
  const render = async () => {
    const notes = await api.getNotifications();
    const unread = notes.filter((n) => !n.read).length;
    host.innerHTML = `<a class="bell" href="${escapeAttr(pageHref)}" title="${escapeAttr(t("nav_notice"))}"><i data-lucide="bell"></i>${
      unread ? `<span class="cart-count">${unread}</span>` : ""
    }</a>`;
    mountIcons(host);
  };
  await render();
  window.setInterval(render, 10000);
}

export function noteText(n) {
  if (n.vars?.message) return n.vars.message;
  return t(n.key || "nav_notice", n.vars || {});
}
