import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { formatTime } from "../format.js";
import { escapeHtml } from "../html.js";

if (!bootAdmin()) throw new Error("admin");

const reviews = await api.getAdminReviews();
const list = qs("#list");

if (!reviews.length) {
  list.innerHTML = `<p class="empty">${t("no_reviews")}</p>`;
} else {
  list.innerHTML = reviews
    .map(
      (r) => `
    <article class="card">
      <strong>${escapeHtml(r.rating)} / 5</strong>
      <div class="muted">${escapeHtml(r.store_id)} · ${escapeHtml(r.order_id)}</div>
      <p>${escapeHtml(r.comment || "")}</p>
      <div class="muted">${formatTime(r.created_at)}</div>
    </article>`
    )
    .join("");
}
