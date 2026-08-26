import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { formatTime } from "../format.js";

if (!bootAdmin()) throw new Error("admin");

const users = await api.getAdminUsers();
const list = qs("#list");
const roleKey = { customer: "role_customer", store: "role_store", admin: "role_admin" };

if (!users.length) {
  list.innerHTML = `<p class="empty">${t("no_users")}</p>`;
} else {
  list.innerHTML = users
    .map(
      (u) => `
    <article class="card">
      <strong>${u.name}</strong>
      <div class="muted">${u.user_id}</div>
      <div>${t(roleKey[u.role] || u.role)}${u.store_id ? " · " + u.store_id : ""}</div>
      <span class="badge ${u.status === "active" ? "" : "off"}">${u.status}</span>
      <div class="muted">${formatTime(u.created_at)}</div>
    </article>`
    )
    .join("");
}
