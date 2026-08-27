import { api } from "../api.js";
import { qs } from "../nav.js";
import { t, storeLabel } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { mountIconPick } from "../easy-pick.js";
import { escapeAttr, escapeHtml } from "../html.js";
import { mountPasswordToggles } from "../password-toggle.js";
import { servicePeriodsLabel } from "../service-periods.js";

if (!bootAdmin()) throw new Error("admin");
mountPasswordToggles();

const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const loginFields = qs("#loginFields");
const submitBtn = qs("#submitBtn");
const cancelBtn = qs("#cancelEdit");
const iconPick = qs("#iconPick");

mountIconPick(iconPick, { name: "image", value: "🏪" });

function fdObj(f) {
  const formData = new FormData(f);
  return {
    ...Object.fromEntries(formData.entries()),
    service_periods: formData.getAll("service_periods"),
  };
}

function setPeriods(periods = ["breakfast", "lunch"]) {
  const selected = new Set(periods);
  form.querySelectorAll('[name="service_periods"]').forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function setCreateMode() {
  form.reset();
  form.store_id.value = "";
  setPeriods();
  iconPick._set("🏪");
  loginFields.hidden = false;
  qs("#resetBox").hidden = true;
  form.username.disabled = false;
  form.password.disabled = false;
  submitBtn.textContent = t("form_add_store");
  cancelBtn.hidden = true;
}

async function render() {
  const resets = await api.getPasswordResets();
  const stores = await api.getStores();
  const resetIds = new Set(resets.map((r) => r.store_id));
  if (!stores.length) {
    list.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
    return;
  }
  list.innerHTML = stores
    .map((s) => {
      const lab = storeLabel(s);
      const open = s.status === "open";
      return `
      <article class="card">
        <strong>${escapeHtml(s.image || "🏪")} ${escapeHtml(lab.name)}</strong>
        <div class="muted">${escapeHtml(s.store_id)}</div>
        ${resetIds.has(s.store_id) ? `<div class="badge off">${t("pending_reset")}</div>` : ""}
        <div class="muted">${escapeHtml(lab.desc)}</div>
        <div class="muted">${escapeHtml(servicePeriodsLabel(s.service_periods))}</div>
        <span class="badge ${open ? "" : "off"}">${open ? t("open") : t("closed")}</span>
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-edit="${escapeAttr(s.store_id)}">${escapeHtml(t("edit"))}</button>
          <a class="btn btn-ghost" href="products.html?store_id=${encodeURIComponent(s.store_id)}">${t("go_products")}</a>
          <button class="btn ${open ? "btn-danger" : ""}" type="button" data-toggle="${escapeAttr(s.store_id)}">${
            open ? t("disable_store") : t("enable_store")
          }</button>
          <button class="btn btn-danger" type="button" data-del="${escapeAttr(s.store_id)}">${escapeHtml(t("delete"))}</button>
        </div>
      </article>`;
    })
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = fdObj(form);
  msg.textContent = "";
  if (!data.service_periods.length) {
    msg.textContent = t("need_service_period");
    return;
  }
  let res;
  if (data.store_id) {
    res = await api.updateStore(data.store_id, data);
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
  if (res.username) {
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
  const stores = await api.getStores();
  if (edit) {
    const s = stores.find((x) => x.store_id === edit.dataset.edit);
    if (!s) return;
    form.store_id.value = s.store_id;
    form.store_name.value = s.store_name;
    form.description.value = s.description || "";
    setPeriods(s.service_periods);
    iconPick._set(s.image);
    loginFields.hidden = true;
    qs("#resetBox").hidden = false;
    form.username.disabled = true;
    form.password.disabled = true;
    submitBtn.textContent = t("form_save_store");
    cancelBtn.hidden = false;
    form.store_name.focus();
  }
  if (tog) {
    const s = stores.find((x) => x.store_id === tog.dataset.toggle);
    if (!s) return;
    await api.updateStore(s.store_id, { status: s.status === "open" ? "closed" : "open" });
    render();
  }
  if (del) {
    const s = stores.find((x) => x.store_id === del.dataset.del);
    if (!s) return;
    if (!confirm(t("confirm_delete_store", { name: storeLabel(s).name }))) return;
    const res = await api.deleteStore(s.store_id);
    msg.textContent = res.ok ? t("deleted_ok") : t(res.code);
    if (res.ok && form.store_id.value === s.store_id) setCreateMode();
    render();
  }
});

setCreateMode();
render();
