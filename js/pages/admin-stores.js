import { api } from "../api.js";
import { qs } from "../nav.js";
import { t, storeLabel } from "../i18n.js";
import { runAdminPage } from "../admin-boot.js";
import { mountIconPick } from "../easy-pick.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { mountPasswordToggles } from "../password-toggle.js";
import { schoolPickupWindowsLabel } from "../service-periods.js";
import { canPermanentlyDeleteStore } from "../admin-data.js";
import { createInflight } from "../ui-state.js";

await runAdminPage(async () => {
mountPasswordToggles();

const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const loginFields = qs("#loginFields");
const submitBtn = qs("#submitBtn");
const cancelBtn = qs("#cancelEdit");
const iconPick = qs("#iconPick");
const pickupNote = qs("#schoolPickupNote");
const gate = createInflight();

mountIconPick(iconPick, { name: "image", value: "🏪" });
if (pickupNote) {
  pickupNote.textContent = t("school_pickup_admin_note", { windows: schoolPickupWindowsLabel() });
}

function fdObj(f) {
  const formData = new FormData(f);
  return Object.fromEntries(formData.entries());
}

function setCreateMode() {
  form.reset();
  form.store_id.value = "";
  iconPick._set("🏪");
  loginFields.hidden = false;
  qs("#resetBox").hidden = true;
  form.username.disabled = false;
  form.password.disabled = false;
  submitBtn.textContent = t("form_add_store");
  cancelBtn.hidden = true;
}

async function loadStores() {
  const result = await api.getStores();
  return result.ok ? result.data || [] : [];
}

function statusBadge(status) {
  if (status === "open") return `<span class="badge">${t("open")}</span>`;
  if (status === "disabled") return `<span class="badge off">${t("store_disabled")}</span>`;
  return `<span class="badge off">${t("closed")}</span>`;
}

async function render() {
  const resets = await api.getPasswordResets();
  const stores = await loadStores();
  const countsResult = await api.getStoreOrderCounts();
  const countsKnown = Boolean(countsResult.ok);
  const resetIds = new Set(resets.map((r) => r.store_id));
  if (!stores.length) {
    list.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
    return;
  }
  list.innerHTML = stores
    .map((s) => {
      const lab = storeLabel(s);
      const active = s.status === "open";
      const orders = countsKnown ? Number(countsResult.counts?.[s.store_id] || 0) : null;
      const canDelete = countsKnown && orders === 0;
      const deleteButton = canDelete
        ? `<button class="btn btn-danger" type="button" data-del="${escapeAttr(s.store_id)}" data-orders="0">${escapeHtml(t("delete"))}</button>`
        : `<button class="btn" type="button" disabled aria-disabled="true">${escapeHtml(t(countsKnown ? "store_delete_locked" : "backend_error"))}</button>`;
      return `
      <article class="card">
        <strong>${escapeHtml(s.image || "🏪")} ${escapeHtml(lab.name)}</strong>
        <div class="muted">${escapeHtml(s.store_id)}</div>
        ${resetIds.has(s.store_id) ? `<div class="badge off">${t("pending_reset")}</div>` : ""}
        <div class="muted">${escapeHtml(lab.desc)}</div>
        <div class="muted">${escapeHtml(schoolPickupWindowsLabel())}</div>
        ${statusBadge(s.status)}
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-edit="${escapeAttr(s.store_id)}">${escapeHtml(t("edit"))}</button>
          <a class="btn btn-ghost" href="products.html?store_id=${encodeURIComponent(s.store_id)}">${t("go_products")}</a>
          <button class="btn ${active ? "btn-danger" : ""}" type="button" data-toggle="${escapeAttr(s.store_id)}">${
            active ? t("disable_store") : t("enable_store")
          }</button>
          ${deleteButton}
        </div>
      </article>`;
    })
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = fdObj(form);
  msg.textContent = "";
  let res;
  if (data.store_id) {
    res = await api.updateStore(data.store_id, data);
    if (res.ok && data.username && data.password) {
      const account = await api.createStoreAccount(
        data.store_id,
        data.username,
        data.password,
        data.store_name
      );
      if (!account.ok) {
        msg.textContent = t(account.code);
        return;
      }
      res = { ...res, username: data.username, store: res.store || { store_name: data.store_name, store_id: data.store_id } };
    }
  } else {
    if (!data.username || !data.password) {
      msg.textContent = t("bad_login");
      return;
    }
    res = await api.createStore(data);
  }
  if (!res.ok) {
    msg.textContent = t(res.code);
    return;
  }
  if (res.username && data.store_id) {
    msg.textContent = t("attach_store_login", { user: res.username });
  } else if (res.username) {
    msg.textContent = t("store_created_msg", {
      name: res.store.store_name,
      id: res.store.store_id,
      user: res.username,
    });
  } else {
    msg.textContent = t("saved_ok");
  }
  setCreateMode();
  render();
});

cancelBtn.addEventListener("click", () => {
  msg.textContent = "";
  setCreateMode();
});

qs("#resetPw").addEventListener("click", async () => {
  const id = form.store_id.value;
  const pwd = form.new_password.value;
  if (!id) return;
  const res = await api.resetStorePassword(id, pwd);
  msg.textContent = res.ok ? t("pw_reset_ok") : t(res.code);
  if (res.ok) form.new_password.value = "";
});

list.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const tog = e.target.closest("[data-toggle]");
  const del = e.target.closest("[data-del]");
  const stores = await loadStores();
  if (edit) {
    const s = stores.find((x) => x.store_id === edit.dataset.edit);
    if (!s) return;
    form.store_id.value = s.store_id;
    form.store_name.value = s.store_name;
    form.description.value = s.description || "";
    iconPick._set(s.image);
    loginFields.hidden = false;
    qs("#resetBox").hidden = false;
    form.username.disabled = false;
    form.password.disabled = false;
    form.username.value = "";
    form.password.value = "";
    submitBtn.textContent = t("form_save_store");
    cancelBtn.hidden = false;
    form.store_name.focus();
  }
  if (tog) {
    const s = stores.find((x) => x.store_id === tog.dataset.toggle);
    if (!s) return;
    const run = await gate.run(async () => {
      tog.disabled = true;
      tog.textContent = t("working");
      const next = s.status === "open" ? "disabled" : "open";
      const res =
        next === "disabled" ? await api.disableStore(s.store_id) : await api.enableStore(s.store_id);
      msg.textContent = res.ok ? t("saved_ok") : t(res.code || "backend_error");
      await render();
    });
    if (run?.skipped) return;
  }
  if (del) {
    if (del.disabled || del.getAttribute("aria-disabled") === "true") return;
    const s = stores.find((x) => x.store_id === del.dataset.del);
    if (!s || !canPermanentlyDeleteStore({ orders: Number(del.dataset.orders || 0) })) return;
    const run = await gate.run(async () => {
      const impact = await api.getStoreImpact(s.store_id);
      if (!impact.ok || !canPermanentlyDeleteStore(impact)) {
        msg.textContent = t("store_has_orders");
        await render();
        return;
      }
      if (
        !confirm(
          t("confirm_delete_store_safe", {
            name: storeLabel(s).name,
            products: impact.products,
            images: impact.images,
            users: impact.users,
          })
        )
      ) {
        return;
      }
      del.disabled = true;
      del.textContent = t("working");
      const res = await api.deleteStore(s.store_id);
      msg.textContent = res.ok ? t("deleted_ok") : t(res.code || "store_delete_failed");
      if (res.ok && form.store_id.value === s.store_id) setCreateMode();
      await render();
    });
    if (run?.skipped) return;
  }
});

setCreateMode();
render();
});
