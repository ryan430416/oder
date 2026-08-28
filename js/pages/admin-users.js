import { api } from "../api.js";
import { qs } from "../nav.js";
import { t } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { formatTime } from "../format.js";
import { escapeAttr, escapeHtml } from "../html.js";

if (!(await bootAdmin())) throw new Error("admin");

const list = qs("#list");
const msg = qs("#msg");
const roleKey = { customer: "role_customer", store: "role_store", admin: "role_admin" };

async function render() {
  const users = await api.getAdminUsers();
  if (!users.length) {
    list.innerHTML = `<p class="empty">${t("no_users")}</p>`;
    return;
  }
  list.innerHTML = users
    .map((u) => {
      const role = t(roleKey[u.role] || u.role);
      return `
    <article class="card">
      <strong>${escapeHtml(u.name)}</strong>
      <div class="muted">${escapeHtml(u.user_id)}</div>
      <div>${escapeHtml(role)}${u.store_id ? " · " + escapeHtml(u.store_id) : ""}</div>
      <span class="badge ${u.status === "active" ? "" : "off"}">${escapeHtml(u.status)}</span>
      <div class="muted">${formatTime(u.created_at)}</div>
      ${
        u.role === "admin"
          ? ""
          : `<div class="row-actions">
              <button class="btn ${u.status === "active" ? "btn-danger" : ""}" type="button"
                data-user-status="${escapeAttr(u.user_id)}"
                data-next-status="${u.status === "active" ? "disabled" : "active"}"
                data-user-name="${escapeAttr(u.name)}"
                data-user-role="${escapeAttr(role)}">${t(u.status === "active" ? "disable_account" : "enable_account")}</button>
            </div>`
      }
    </article>`;
    })
    .join("");
}

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-status]");
  if (!button) return;
  if (
    !confirm(
      t("confirm_user_status", {
        name: button.dataset.userName,
        role: button.dataset.userRole,
      })
    )
  ) {
    return;
  }
  button.disabled = true;
  const result = await api.setUserStatus(button.dataset.userStatus, button.dataset.nextStatus);
  msg.textContent = result.ok ? t("saved_ok") : t(result.code || "backend_error");
  if (result.ok) await render();
  else button.disabled = false;
});

render();
