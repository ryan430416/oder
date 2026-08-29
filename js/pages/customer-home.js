import { auth } from "../auth.js";
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

initI18n();
mountIcons();

const listEl = qs("#list");
const statusEl = qs("#catalogStatus");
const gate = createInflight();
let stores = [];
let loadError = false;
let loading = true;

function skeletonHtml() {
  return `<div class="card skeleton" aria-hidden="true"></div><div class="card skeleton" aria-hidden="true"></div>`;
}

function isOpen(s) {
  return s.status === "open";
}

function matches(s, filter) {
  if (!filter) return true;
  const lab = storeLabel(s);
  return lab.name.toLowerCase().includes(filter) || s.store_name.toLowerCase().includes(filter);
}

function paint() {
  const phase = storeListPhase({ loading, error: loadError, stores });
  if (phase === "loading") {
    hideBackendNotice(statusEl);
    listEl.setAttribute("aria-busy", "true");
    listEl.setAttribute("aria-label", t("stores_loading"));
    listEl.innerHTML = skeletonHtml();
    return;
  }
  listEl.removeAttribute("aria-busy");
  listEl.removeAttribute("aria-label");
  if (phase === "error") {
    listEl.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: "stores_load_failed",
      busy: gate.busy,
      onRetry: () => loadStores(),
    });
    return;
  }
  if (loadError) {
    renderBackendNotice(statusEl, {
      code: "stores_load_failed",
      busy: gate.busy,
      onRetry: () => loadStores(),
    });
  } else {
    hideBackendNotice(statusEl);
  }
  const filter = qs("#search").value.trim().toLowerCase();
  const rows = stores.filter((s) => matches(s, filter));
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
    paint();
    try {
      const result = await api.getStores();
      if (!result.ok) {
        loadError = true;
        return;
      }
      loadError = false;
      stores = result.data || [];
    } catch {
      loadError = true;
    } finally {
      loading = false;
      paint();
    }
  });
  if (run?.skipped) return;
}

async function boot() {
  paint();
  try {
    const session = await auth.ensureCustomer();
    if (!session) throw new Error("backend_unavailable");
    qs("#who").textContent = t("who", { name: session.name });
    qs("#custName").value = session.name === "學生小明" ? "" : session.name;
    qs("#custGrade").value = session.grade || "";
    qs("#cartCount").textContent = cart.count();
    qs("#cartCount").hidden = cart.count() === 0;
    mountBell(qs("#bellHost"), "notifications.html");
    qs("#saveName").addEventListener("click", async () => {
      const res = await auth.setCustomerProfile(qs("#custName").value, qs("#custGrade").value);
      if (!res.ok) {
        qs("#nameMsg").textContent = t(res.code);
        return;
      }
      qs("#nameMsg").textContent = t("profile_saved");
      qs("#who").textContent = t("who", { name: res.session.name });
    });
    qs("#search").addEventListener("input", () => paint());
    await loadStores();
  } catch {
    loading = false;
    loadError = true;
    paint();
  }
}

boot();
