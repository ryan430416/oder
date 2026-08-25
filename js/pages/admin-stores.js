import { auth } from "../auth.js";
import { api } from "../api.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel } from "../i18n.js";
import { mountTimePick, mountIconPick } from "../easy-pick.js";

initI18n();
auth.requireRole("admin", "index.html");

const form = qs("#form");
const list = qs("#list");
const msg = qs("#msg");
const loginFields = qs("#loginFields");
const submitBtn = qs("#submitBtn");
const openPick = qs("#openPick");
const closePick = qs("#closePick");
const iconPick = qs("#iconPick");

mountTimePick(openPick, { name: "open_time", value: "10:00", fallback: "10:00" });
mountTimePick(closePick, { name: "close_time", value: "20:00", fallback: "20:00" });
mountIconPick(iconPick, { name: "image", value: "🏪" });

function fdObj(f) {
  return Object.fromEntries(new FormData(f).entries());
}

function resetPickers() {
  openPick._set("10:00");
  closePick._set("20:00");
  iconPick._set("🏪");
}

async function render() {
  const stores = await api.getStores();
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
        <div class="muted">${lab.desc}</div>
        <div class="muted">${s.open_time}–${s.close_time}</div>
        <span class="badge ${open ? "" : "off"}">${open ? t("open") : t("closed")}</span>
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-edit="${s.store_id}">${t("edit")}</button>
          <button class="btn ${open ? "btn-danger" : ""}" type="button" data-toggle="${s.store_id}">${
            open ? t("disable_store") : t("enable_store")
          }</button>
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
  form.reset();
  form.store_id.value = "";
  resetPickers();
  loginFields.hidden = false;
  form.username.required = true;
  form.password.required = true;
  submitBtn.textContent = t("form_add_store");
  render();
});

list.addEventListener("click", async (e) => {
  const edit = e.target.closest("[data-edit]");
  const tog = e.target.closest("[data-toggle]");
  const stores = await api.getStores();
  if (edit) {
    const s = stores.find((x) => x.store_id === edit.dataset.edit);
    if (!s) return;
    form.store_id.value = s.store_id;
    form.store_name.value = s.store_name;
    form.description.value = s.description;
    openPick._set(s.open_time);
    closePick._set(s.close_time);
    iconPick._set(s.image);
    loginFields.hidden = true;
    form.username.required = false;
    form.password.required = false;
    submitBtn.textContent = t("form_save_store");
  }
  if (tog) {
    const s = stores.find((x) => x.store_id === tog.dataset.toggle);
    await api.updateStore(s.store_id, { status: s.status === "open" ? "closed" : "open" });
    render();
  }
});

form.username.required = true;
form.password.required = true;
render();
