import { AUTH_COLLECTION } from "./collections.js";
import { config } from "./config.js";

const GUEST_DOMAIN = "campus-order.test";

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomGuestCredentials() {
  const id = crypto.randomUUID();
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const password = `${toBase64Url(bytes)}Aa1`;
  return {
    email: `guest_${id.replace(/-/g, "")}@${GUEST_DOMAIN}`,
    password,
    passwordConfirm: password,
  };
}

export function guestCreatePayload() {
  const credentials = randomGuestCredentials();
  return {
    ...credentials,
    role: "customer",
    status: "active",
    display_name: "",
    emailVisibility: false,
  };
}

export function publicGuestError(error) {
  const data = error?.data || {};
  const fields = data.data && typeof data.data === "object" ? data.data : {};
  return {
    status: error?.status || 0,
    code: data.code || error?.message || "anonymous_login_failed",
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [name, value?.code || value?.message || "invalid"])
    ),
  };
}

export function logGuestAuthFailure(error) {
  if (config.APP_ENV === "production") return;
  const info = publicGuestError(error);
  console.info("[guest-auth]", info);
}

export function isUniqueConflict(error) {
  const info = publicGuestError(error);
  return info.status === 400 && (info.fields.email === "validation_not_unique" || info.code === "validation_not_unique");
}

export function isMissingRequired(error) {
  const info = publicGuestError(error);
  return Object.values(info.fields).some((code) => String(code).includes("required") || String(code).includes("min"));
}

export function activeCustomerRecord(record) {
  return Boolean(record && record.role === "customer" && record.status === "active");
}

export function shouldQueryCustomerData(result) {
  return Boolean(result?.ok && result.session);
}

export async function restoreCustomerRecord(collection, authStore) {
  if (!authStore?.isValid) return null;
  try {
    await collection.authRefresh();
    const record = authStore.record || authStore.model || null;
    if (record?.status === "active") return record;
    authStore.clear();
    return null;
  } catch (error) {
    logGuestAuthFailure(error);
    authStore.clear();
    return null;
  }
}

export async function createGuestSession(collection, authStore, { attempts = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const payload = guestCreatePayload();
    try {
      await collection.create(payload);
      await collection.authWithPassword(payload.email, payload.password);
      const record = authStore.record || authStore.model || null;
      if (!activeCustomerRecord(record)) {
        authStore.clear();
        return { ok: false, code: "anonymous_login_failed" };
      }
      return { ok: true, session: record, reused: false };
    } catch (error) {
      lastError = error;
      logGuestAuthFailure(error);
      if (isUniqueConflict(error)) continue;
      break;
    }
  }
  return {
    ok: false,
    code: isMissingRequired(lastError) ? "anonymous_login_failed" : "anonymous_login_failed",
    reason: publicGuestError(lastError).code,
  };
}

export async function loginAsGuest(client, collectionName = AUTH_COLLECTION) {
  const collection = client.collection(collectionName);
  const reused = await restoreCustomerRecord(collection, client.authStore);
  if (reused) return { ok: true, session: reused, reused: true };
  return createGuestSession(collection, client.authStore);
}
