import { t } from "./i18n.js";

export const SERVICE_PERIODS = {
  breakfast: {
    open: "08:35",
    close: "10:35",
    key: "period_breakfast",
    windows: [
      ["08:35", "08:45"],
      ["09:30", "09:40"],
      ["10:25", "10:35"],
    ],
  },
  lunch: {
    open: "11:20",
    close: "18:25",
    key: "period_lunch",
    windows: [
      ["11:20", "11:30"],
      ["12:15", "13:00"],
      ["17:15", "17:30"],
      ["18:15", "18:25"],
    ],
  },
  afternoon_tea: {
    open: "17:15",
    close: "18:25",
    key: "period_afternoon_tea",
    windows: [
      ["17:15", "17:30"],
      ["18:15", "18:25"],
    ],
  },
};

export const SCHOOL_PICKUP_WINDOWS = [
  ["08:35", "08:45"],
  ["09:30", "09:40"],
  ["10:25", "10:35"],
  ["11:20", "11:30"],
  ["12:15", "13:00"],
  ["17:15", "17:30"],
  ["18:15", "18:25"],
];

/**
 * Legacy per-store meal-period flags. The admin UI no longer edits these;
 * customer pickup always uses SCHOOL_PICKUP_WINDOWS. Keep writing the column
 * so existing rows and database constraints stay intact.
 */
export const LEGACY_STORE_SERVICE_PERIODS = ["breakfast", "lunch", "afternoon_tea"];

export function schoolPickupWindowsLabel() {
  return SCHOOL_PICKUP_WINDOWS.map(([open, close]) => `${open}–${close}`).join("、");
}

export function normalizeServicePeriods(value) {
  const source = Array.isArray(value) ? value : [];
  const selected = new Set(source);
  return Object.keys(SERVICE_PERIODS).filter((id) => selected.has(id));
}

export function servicePeriodsLabel(value) {
  const periods = normalizeServicePeriods(value);
  return periods.length ? periods.map((id) => t(SERVICE_PERIODS[id].key)).join("、") : "—";
}

export function servicePeriodBounds(value) {
  const periods = normalizeServicePeriods(value);
  if (!periods.length) return { open_time: "08:35", close_time: "13:00" };
  return {
    open_time: SERVICE_PERIODS[periods[0]].open,
    close_time: SERVICE_PERIODS[periods[periods.length - 1]].close,
  };
}
