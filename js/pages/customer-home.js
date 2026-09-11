import { auth, customerLabel } from "../auth.js";
import { api } from "../api.js";
import { cart } from "../cart.js";
import { qs } from "../nav.js";
import { initI18n, t, storeLabel } from "../i18n.js";
import { mountBell } from "../notify-ui.js";
import { escapeHtml } from "../html.js";
import { schoolPickupWindowsLabel } from "../service-periods.js";
import { pickupSlotsForStore } from "../format.js";
import { mountIcons } from "../icons.js";
import { createInflight, storeListPhase } from "../ui-state.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";
import { shouldQueryCustomerData } from "../guest-session.js";

initI18n();
mountIcons();

const listEl = qs("#list");
const statusEl = qs("#catalogStatus");
const gate = createInflight();
let stores = [];
let loadError = false;
let authError = false;
let loading = true;
let profileBound = false;

function skeletonHtml() {
  return `<div class="card skeleton" aria-hidden="true"></div><div class="card skeleton" aria-hidden="true"></div>`;
}

function isOpen(s) {
  return s.status === "open";
}

function searchValue() {
  return qs("#search").value.trim().toLowerCase();
}

function matches(s, filter) {
  if (!filter) return true;
  const lab = storeLabel(s);
  return lab.name.toLowerCase().includes(filter) || s.store_name.toLowerCase().includes(filter);
}

function paint() {
  const filter = searchValue();
  const phase = storeListPhase({
    loading,
    error: loadError,
    authError,
    stores,
    searching: Boolean(filter),
  });
  if (phase === "loading") {
    hideBackendNotice(statusEl);
    listEl.setAttribute("aria-busy", "true");
    listEl.setAttribute("aria-label", t("stores_loading"));
    listEl.innerHTML = skeletonHtml();
    return;
  }
  listEl.removeAttribute("aria-busy");
  listEl.removeAttribute("aria-label");
  if (phase === "auth_error") {
    listEl.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "anonymous_login_failed",
      busy: gate.busy,
      onRetry: () => boot(),
    });
    return;
  }
  if (phase === "error") {
    listEl.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "stores_load_failed",
      busy: gate.busy,
      onRetry: () => loadStores(),
    });
    return;
  }
  hideBackendNotice(statusEl);
  const rows = stores.filter((s) => matches(s, filter));
  if (!stores.length) {
    listEl.innerHTML = `<p class="empty">${t("no_open_stores")}</p>`;
    return;
  }
  if (!rows.length) {
    listEl.innerHTML = `<p class="empty">${t("no_stores")}</p>`;
    return;
  }
  listEl.innerHTML = rows
    .map((s) => {
      const lab = storeLabel(s);
      const open = isOpen(s);
      const nextSlot = pickupSlotsForStore(s)[0];
      const tag = open ? "a" : "article";
      const link = open
        ? ` href="store.html?store_id=${encodeURIComponent(s.store_id)}"`
        : ` aria-disabled="true"`;
      return `
    <${tag} class="card store-card ${open ? "" : "is-closed"}"${link}>
      <div class="store-emoji">${escapeHtml(s.image || "🏪")}</div>
      <div>
        <strong>${escapeHtml(lab.name)}</strong>
        <div class="muted">${escapeHtml(lab.desc)}</div>
        <div class="muted">${escapeHtml(schoolPickupWindowsLabel())}</div>
        ${nextSlot ? `<div class="muted">${escapeHtml(t("next_pickup", { time: nextSlot.label }))}</div>` : ""}
      </div>
      <span class="badge ${open ? "" : "off"}">${escapeHtml(open ? t("open") : t("closed"))}</span>
    </${tag}>`;
    })
    .join("");
}

async function loadStores() {
  const run = await gate.run(async () => {
    loading = true;
    loadError = false;
    paint();
    try {
      const result = await api.getStores();
      if (!result.ok) {
        loadError = true;
        stores = [];
        return;
      }
      stores = result.data || [];
    } catch {
      loadError = true;
      stores = [];
    } finally {
      loading = false;
      paint();
    }
  });
  if (run?.skipped) return;
}

function paintWho(session) {
  const who = qs("#who");
  if (!who) return;
  who.textContent = t("who", { name: customerLabel(session, t("guest_name")) });
  who.hidden = false;
}

function bindProfile(session) {
  paintWho(session);
  qs("#custName").value = session.name || "";
  qs("#custGrade").value = session.grade || "";
  mountBell(qs("#bellHost"), "notifications.html");
  if (profileBound) return;
  profileBound = true;
  qs("#saveName").addEventListener("click", async () => {
    const res = await auth.setCustomerProfile(qs("#custName").value, qs("#custGrade").value);
    if (!res.ok) {
      qs("#nameMsg").textContent = t(res.code);
      return;
    }
    qs("#nameMsg").textContent = t("profile_saved");
    paintWho(res.session);
  });
}

async function boot() {
  const run = await gate.run(async () => {
    loading = true;
    authError = false;
    loadError = false;
    paint();
    qs("#cartCount").textContent = cart.count();
    qs("#cartCount").hidden = cart.count() === 0;
    const result = await auth.ensureCustomer();
    if (!shouldQueryCustomerData(result)) {
      authError = true;
      stores = [];
      return;
    }
    bindProfile(result.session);
    loading = true;
    paint();
    const storeResult = await api.getStores();
    if (!storeResult.ok) {
      loadError = true;
      stores = [];
      return;
    }
    stores = storeResult.data || [];
  });
  loading = false;
  paint();
  if (run?.skipped) return;
}

qs("#search").addEventListener("input", () => paint());
boot();
