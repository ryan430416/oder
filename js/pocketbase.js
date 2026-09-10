import { config, loadConfig } from "./config.js";
import { renderBackendNotice } from "./backend-ui.js";

let clientPromise;
let pingInflight = null;

function showBackendError(code = "backend_error") {
  if (typeof document === "undefined" || !document.body || document.querySelector("[data-backend-notice]")) return;
  const notice = document.createElement("div");
  notice.dataset.backendNotice = "true";
  document.body.prepend(notice);
  renderBackendNotice(notice, {
    code,
    onRetry: () => location.reload(),
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (/backend_unavailable|backend_error|Failed to fetch|NetworkError/.test(event.message || "")) {
      event.preventDefault();
      showBackendError("backend_error");
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (/backend_unavailable|backend_error|Failed to fetch|NetworkError/.test(String(event.reason?.message || event.reason))) {
      event.preventDefault();
      showBackendError("backend_error");
    }
  });
}

export function isPocketBaseEnabled() {
  return Boolean(config.POCKETBASE_URL);
}

export function authRecord(client) {
  return client?.authStore?.record || client?.authStore?.model || null;
}

export async function getPocketBase() {
  await loadConfig();
  if (!isPocketBaseEnabled()) {
    if (typeof document !== "undefined") document.documentElement.dataset.backendError = "true";
    throw new Error("backend_unavailable");
  }
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/pocketbase@0.26/+esm")
      .then(({ default: PocketBase, LocalAuthStore }) => {
        const store =
          typeof LocalAuthStore === "function"
            ? new LocalAuthStore("campus_order_pb", window.sessionStorage)
            : undefined;
        const client = new PocketBase(config.POCKETBASE_URL, store);
        client.autoCancellation(false);
        return client;
      })
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

async function healthOnce() {
  const client = await getPocketBase();
  await client.health.check();
}

export async function pingBackend() {
  await loadConfig();
  if (!isPocketBaseEnabled()) return { ok: false, code: "pocketbase_not_configured" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, code: "backend_offline" };
  }
  if (pingInflight) return pingInflight;
  pingInflight = (async () => {
    try {
      await healthOnce();
      return { ok: true };
    } catch (firstError) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        await healthOnce();
        return { ok: true };
      } catch (error) {
        console.error("PocketBase ping failed", error || firstError);
        return { ok: false, code: "backend_error" };
      }
    } finally {
      pingInflight = null;
    }
  })();
  return pingInflight;
}

export async function appSend(path, body = {}) {
  try {
    const client = await getPocketBase();
    const headers = { "Content-Type": "application/json" };
    if (client.authStore.token) headers.Authorization = client.authStore.token;
    try {
      const response = await fetch(path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (response.status !== 404 && response.status !== 405) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) return { ok: false, code: "session_expired" };
        if (!response.ok && !data.code) return { ok: false, code: "backend_error" };
        return data;
      }
    } catch {
      // Local static servers without Vercel functions fall back to PocketBase hooks.
    }
    return await client.send(path, { method: "POST", body });
  } catch (error) {
    console.error(`PocketBase ${path} failed`, error);
    if (error?.status === 401) return { ok: false, code: "session_expired" };
    const data = error?.data || error?.response || {};
    return { ok: false, code: data.code || "backend_error" };
  }
}
