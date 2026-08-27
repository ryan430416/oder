import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { formatTime } from "../format.js";
import { noteText } from "../notify-ui.js";
import { escapeAttr, escapeHtml } from "../html.js";

export async function renderNoticeList() {
  const list = qs("#list");
  const notes = await api.getNotifications();
  if (!notes.length) {
    list.innerHTML = `<p class="empty">${t("notice_empty")}</p>`;
    return;
  }
  list.innerHTML = notes
    .map(
      (n) => `
    <article class="card" data-nid="${escapeAttr(n.notification_id)}">
      <strong>${escapeHtml(noteText(n))}</strong>
      <div class="muted">${formatTime(n.created_at)}</div>
      ${n.read ? "" : `<button class="btn btn-ghost" type="button" data-read="${escapeAttr(n.notification_id)}">OK</button>`}
    </article>`
    )
    .join("");
  list.onclick = async (e) => {
    const btn = e.target.closest("[data-read]");
    if (!btn) return;
    await api.markNotificationRead(btn.dataset.read);
    renderNoticeList();
  };
}
