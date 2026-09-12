import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { formatTime } from "../format.js";
import { noteText } from "../notify-ui.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

function statusHost() {
  return qs("#noticeStatus");
}

function showLoading(list) {
  list.setAttribute("aria-busy", "true");
  list.innerHTML = `<p class="empty">${escapeHtml(t("notices_loading"))}</p>`;
}

function showError(list, retry) {
  list.removeAttribute("aria-busy");
  const host = statusHost();
  if (host) {
    list.innerHTML = "";
    renderBackendNotice(host, { code: "notices_load_failed", onRetry: retry });
    return;
  }
  list.innerHTML = `<p class="empty">${escapeHtml(t("notices_load_failed"))}</p><button class="btn" type="button" data-retry-notices="1">${escapeHtml(t("retry"))}</button>`;
  list.querySelector("[data-retry-notices]")?.addEventListener("click", () => retry());
}

export async function renderNoticeList() {
  const list = qs("#list");
  if (!list) return { ok: false, code: "notices_load_failed" };
  showLoading(list);
  hideBackendNotice(statusHost());
  const result = await api.getNotifications();
  if (!result?.ok) {
    showError(list, () => renderNoticeList());
    return result || { ok: false, code: "notices_load_failed" };
  }
  const notes = result.data || [];
  list.removeAttribute("aria-busy");
  if (!notes.length) {
    list.innerHTML = `<p class="empty">${escapeHtml(t("notice_empty"))}</p>`;
    return result;
  }
  list.innerHTML = notes
    .map(
      (n) => `
    <article class="card" data-nid="${escapeAttr(n.notification_id)}">
      <strong>${escapeHtml(noteText(n))}</strong>
      <div class="muted">${escapeHtml(formatTime(n.created_at))}</div>
      ${n.read ? "" : `<button class="btn btn-ghost" type="button" data-read="${escapeAttr(n.notification_id)}">OK</button>`}
    </article>`
    )
    .join("");
  list.onclick = async (e) => {
    const btn = e.target.closest("[data-read]");
    if (!btn) return;
    btn.disabled = true;
    const marked = await api.markNotificationRead(btn.dataset.read);
    if (!marked?.ok) {
      showError(list, () => renderNoticeList());
      return;
    }
    renderNoticeList();
  };
  return result;
}
