/** Campus wall-clock helpers. Always Asia/Bangkok — never the device timezone. */
export const CAMPUS_TIME_ZONE = "Asia/Bangkok";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function campusParts(date, options) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TIME_ZONE,
    hour12: false,
    ...options,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Calendar date YYYY-MM-DD in Asia/Bangkok. */
export function campusDateKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: CAMPUS_TIME_ZONE });
}

export function addCalendarDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

/**
 * Instant for a Bangkok wall-clock time on dateKey (YYYY-MM-DD + HH:mm).
 * Uses Intl offset discovery so DST (if ever applied) does not hardcode +07:00 wrongly.
 */
export function atCampus(dateKey, hhmm) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = String(hhmm).split(":").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const shown = campusParts(new Date(utcMs), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const delta = wanted - actual;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

export function campusClock(date) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: CAMPUS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function campusTimeParts(date) {
  return campusParts(date, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function campusDateTimeParts(date) {
  return campusParts(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format for order lists: M/D HH:mm in Asia/Bangkok. */
export function formatCampusDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const parts = campusDateTimeParts(d);
  return `${parts.month}/${parts.day} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function campusDateKeyFromIso(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return campusDateKey(d);
}
