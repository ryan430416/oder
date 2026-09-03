/**
 * 給年長使用者：用「早上／下午／晚上 + 幾點幾分」點選，不必自己打時間
 */
import { t } from "./i18n.js";
import { toTime24 } from "./format.js";
import { STORE_ICONS } from "./store-image.js";

const MINUTES = ["00", "15", "30", "45"];

export function hourLabel(h) {
  if (h === 0) return t("hour_0");
  if (h < 6) return t("hour_dawn", { n: h });
  if (h < 12) return t("hour_am", { n: h });
  if (h === 12) return t("hour_noon");
  if (h < 18) return t("hour_pm", { n: h - 12 });
  return t("hour_night", { n: h - 12 });
}

function parseHm(value, fallback) {
  const s = toTime24(value, fallback);
  const [hh, mm] = s.split(":");
  let m = mm;
  if (!MINUTES.includes(m)) {
    const n = Number(m);
    m = MINUTES.reduce((best, x) => (Math.abs(Number(x) - n) < Math.abs(Number(best) - n) ? x : best));
  }
  return { h: String(Number(hh)), m };
}

export function mountTimePick(root, { name, value, fallback }) {
  const fb = fallback || "10:00";
  const cur = parseHm(value || fb, fb);
  const hourOpts = Array.from({ length: 24 }, (_, h) => {
    const sel = String(h) === cur.h ? "selected" : "";
    return `<option value="${h}" ${sel}>${hourLabel(h)}</option>`;
  }).join("");
  const minOpts = MINUTES.map(
    (m) => `<option value="${m}" ${m === cur.m ? "selected" : ""}>${m} ${t("unit_min")}</option>`
  ).join("");
  const chips = [
    ["08:00", "chip_8"],
    ["09:00", "chip_9"],
    ["10:00", "chip_10"],
    ["11:00", "chip_11"],
    ["12:00", "chip_12"],
    ["17:00", "chip_17"],
    ["20:00", "chip_20"],
    ["21:00", "chip_21"],
  ];
  root.innerHTML = `
    <div class="easy-time-row">
      <select class="easy-h" aria-label="${t("unit_hour")}">${hourOpts}</select>
      <select class="easy-m" aria-label="${t("unit_min")}">${minOpts}</select>
    </div>
    <div class="easy-chips">
      ${chips.map(([v, k]) => `<button type="button" class="easy-chip" data-t="${v}">${t(k)}</button>`).join("")}
    </div>
    <input type="hidden" name="${name}" value="${toTime24(value || fb, fb)}" />
  `;
  const hidden = root.querySelector("input[type=hidden]");
  const hSel = root.querySelector(".easy-h");
  const mSel = root.querySelector(".easy-m");
  function sync() {
    hidden.value = String(hSel.value).padStart(2, "0") + ":" + mSel.value;
  }
  hSel.addEventListener("change", sync);
  mSel.addEventListener("change", sync);
  root.querySelectorAll(".easy-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { h, m } = parseHm(btn.dataset.t, fb);
      hSel.value = h;
      mSel.value = m;
      sync();
    });
  });
  root._set = (v) => {
    const p = parseHm(v, fb);
    hSel.value = p.h;
    mSel.value = p.m;
    sync();
  };
}

export function mountIconPick(root, { name, value }) {
  const cur = STORE_ICONS.includes(value) ? value : "🏪";
  root.innerHTML = `
    <div class="easy-icons" role="listbox">
      ${STORE_ICONS.map(
        (ic, index) =>
          `<button type="button" class="easy-icon ${ic === cur ? "on" : ""}" data-icon-index="${index}" aria-pressed="${
            ic === cur ? "true" : "false"
          }">${ic}</button>`
      ).join("")}
    </div>
    <input type="hidden" name="${name}" value="${cur}" />
  `;
  const hidden = root.querySelector("input[type=hidden]");
  function applyIcon(ic) {
    const next = STORE_ICONS.includes(ic) ? ic : "🏪";
    hidden.value = next;
    root.querySelectorAll(".easy-icon").forEach((b) => {
      const on = STORE_ICONS[Number(b.dataset.iconIndex)] === next;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".easy-icon");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    applyIcon(STORE_ICONS[Number(btn.dataset.iconIndex)]);
  });
  root._set = applyIcon;
}
