import { t } from "./i18n.js";

export const SERVICE_PERIODS = {
  breakfast: { open: "08:30", close: "10:30", key: "period_breakfast" },
  lunch: { open: "11:00", close: "13:00", key: "period_lunch" },
};

export function normalizeServicePeriods(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.filter((id) => SERVICE_PERIODS[id]))];
}

export function servicePeriodsLabel(value) {
  const periods = normalizeServicePeriods(value);
  return periods.length ? periods.map((id) => t(SERVICE_PERIODS[id].key)).join("、") : "—";
}

export function servicePeriodBounds(value) {
  const periods = normalizeServicePeriods(value);
  if (!periods.length) return { open_time: "08:30", close_time: "13:00" };
  return {
    open_time: SERVICE_PERIODS[periods[0]].open,
    close_time: SERVICE_PERIODS[periods[periods.length - 1]].close,
  };
}
