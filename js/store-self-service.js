/** Store self-service decisions shared by the Vercel API and tests. */

export function orderAllowedForStoreStatus(status) {
  return status === "open";
}

export function storeOrderingTarget(authStoreId, requestedStoreId) {
  const own = String(authStoreId || "");
  const requested = String(requestedStoreId || "");
  if (!own) return { ok: false, code: "not_store" };
  if (requested && requested !== own) return { ok: false, code: "not_store" };
  return { ok: true, storeId: own };
}

export function nextStoreOrderingStatus(currentStatus, requested) {
  if (currentStatus === "disabled") return { ok: false, code: "store_disabled_by_admin" };
  if (requested !== "open" && requested !== "closed") return { ok: false, code: "invalid_status" };
  return { ok: true, status: requested };
}

export function passwordChangeTarget(authUserId, requestedUserId) {
  const own = String(authUserId || "");
  if (!own) return { ok: false, code: "session_expired" };
  if (requestedUserId && String(requestedUserId) !== own) return { ok: false, code: "not_store" };
  return { ok: true, userId: own };
}

export function validatePasswordChange({ currentPassword = "", newPassword = "", confirmPassword = "" } = {}) {
  const current = String(currentPassword);
  const next = String(newPassword);
  const confirm = String(confirmPassword);
  if (!current || !next || !confirm) return "password_required";
  if (next !== confirm) return "password_mismatch";
  if (next.length < 4) return "password_too_short_new";
  if (next === current) return "password_unchanged";
  return "";
}

export function imageWritePlan({ isUpdate = false, fileReady = false, imageRemoved = false } = {}) {
  return {
    prepareBeforeCreate: !isUpdate && fileReady,
    replaceOnCreate: !isUpdate && fileReady,
    replaceOnUpdate: isUpdate && fileReady,
    clearImage: isUpdate && imageRemoved && !fileReady,
  };
}
