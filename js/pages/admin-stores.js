import { api } from "../api.js";
import { qs } from "../nav.js";
import { t, storeLabel } from "../i18n.js";
import { bootAdmin } from "../admin-boot.js";
import { mountTimePick, mountIconPick } from "../easy-pick.js";

if (!bootAdmin()) throw new Error("admin");

const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const loginFields = qs("#loginFields");
const submitBtn = qs("#submitBtn");
const cancelBtn = qs("#cancelEdit");
const openPick = qs("#openPick");
const closePick = qs("#closePick");
const iconPick = qs("#iconPick");

mountTimePick(openPick, { name: "open_time", value: "10:00", fallback: "10:00" });
mountTimePick(closePick, { name: "close_time", value: "20:00", fallback: "20:00" });
mountIconPick(iconPick, { name: "image", value: "🏪" });

function fdObj(f) {
  return Object.fromEntries(new FormData(f).entries());
}

function setCreateMode() {
  form.reset();
  form.store_id.value = "";
  openPick._set("10:00");
  closePick._set("20:00");
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
        <strong>${s.image || "🏪"} ${lab.name}</strong>
        <div class="muted">${s.store_id}</div>
        ${resetIds.has(s.store_id) ? `<div class="badge off">${t("pending_reset")}</div>` : ""}
        <div class="muted">${lab.desc}</div>
        <div class="muted">${s.open_time}–${s.close_time}</div>
        <span class="badge ${open ? "" : "off"}">${open ? t("open") : t("closed")}</span>
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-edit="${s.store_id}">${t("edit")}</button>
          <a class="btn btn-ghost" href="products.html?store_id=${encodeURIComponent(s.store_id)}">${t("go_products")}</a>
          <button class="btn ${open ? "btn-danger" : ""}" type="button" data-toggle="${s.store_id}">${
            open ? t("disable_store") : t("enable_store")
          }</button>
          <button class="btn btn-danger" type="button" data-del="${s.store_id}">${t("delete")}</button>
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
    openPick._set(s.open_time);
    closePick._set(s.close_time);
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
