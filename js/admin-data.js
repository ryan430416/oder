/** Pure helpers for admin dashboard / analytics / store ops (testable without PocketBase). */

import { addCalendarDays, atCampus, campusDateKey } from "./campus-time.js";

const NON_REVENUE = new Set(["cancelled", "rejected"]);

export function bangkokDayRange(dateKey = campusDateKey()) {
  const start = atCampus(dateKey, "00:00");
  const end = atCampus(addCalendarDays(dateKey, 1), "00:00");
  return { dateKey, start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

export function pocketBaseCreatedRangeFilter(dateKey = campusDateKey()) {
  const { startIso, endIso } = bangkokDayRange(dateKey);
  return `created >= "${startIso}" && created < "${endIso}"`;
}

export function isRevenueOrder(order) {
  return order && !NON_REVENUE.has(String(order.status || ""));
}

export function sumTrustedRevenue(orders) {
  return (orders || []).reduce((sum, order) => {
    if (!isRevenueOrder(order)) return sum;
    const total = Number(order.total);
    return Number.isFinite(total) ? sum + total : sum;
  }, 0);
}

export function statusDistribution(orders) {
  const counts = {};
  for (const order of orders || []) {
    const status = String(order.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

export function topKeyedCount(entries) {
  return [...entries].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/** Dashboard tip: null means show ops summary instead of onboarding. */
export function dashboardOnboardingTip({ stores = 0, products = 0, loading = false, error = false } = {}) {
  if (loading || error) return null;
  if (stores <= 0) return "tip_add_stores";
  if (products <= 0) return "tip_add_products";
  return null;
}

export function sanitizeAdminUser(row) {
  if (!row) return null;
  return {
    user_id: row.id || row.user_id || "",
    name: row.display_name || row.name || "",
    email: String(row.email || "").includes("@campus-order.test")
      ? String(row.email || "").replace(/@campus-order\.test$/i, "")
      : String(row.email || ""),
    role: row.role || "",
    status: row.status || "",
    store_id: row.store || row.store_id || "",
    grade: row.grade || "",
    created_at: row.created_at || row.created || "",
  };
}

/** Permanent delete is only allowed when there are zero historical orders. */
export function canPermanentlyDeleteStore(impact) {
  return Number(impact?.orders || 0) === 0;
}

export function photoFormVisibility({ hasPreview = false, uploadFailed = false } = {}) {
  return {
    preview: Boolean(hasPreview),
    remove: Boolean(hasPreview),
    retry: Boolean(uploadFailed) && Boolean(hasPreview),
  };
}

/** Clear the previous error before applying the newly selected file. */
export function photoSelectionResult(validation) {
  if (!validation?.ok) {
    return { preview: false, remove: false, retry: false, message: validation?.code || "invalid_image_type" };
  }
  return { preview: true, remove: true, retry: false, message: "image_ready" };
}
