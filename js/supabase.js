import { config, loadConfig } from "./config.js";
import { t } from "./i18n.js";
import { renderBackendNotice } from "./backend-ui.js";

let clientPromise;

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

export function isSupabaseEnabled() {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
}

export async function getSupabase() {
  await loadConfig();
  if (!isSupabaseEnabled()) {
    if (typeof document !== "undefined") document.documentElement.dataset.backendError = "true";
    throw new Error("backend_unavailable");
  }
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")
      .then(({ createClient }) =>
        createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.sessionStorage,
          },
        })
      )
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

export async function pingBackend() {
  await loadConfig();
  if (!isSupabaseEnabled()) return { ok: false, code: "supabase_not_configured" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, code: "backend_offline" };
  }
  try {
    const client = await getSupabase();
    const { error } = await client.from("stores").select("id").limit(1);
    if (error) {
      console.error("Supabase ping failed", error);
      return { ok: false, code: "backend_error" };
    }
    return { ok: true };
  } catch (error) {
    console.error("Supabase ping failed", error);
    return { ok: false, code: "backend_error" };
  }
}

export async function rpc(name, args = {}) {
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc(name, args);
    if (error) {
      console.error(`Supabase RPC ${name} failed`, error);
      return { ok: false, code: "backend_error" };
    }
    return data;
  } catch (error) {
    console.error(`Supabase RPC ${name} failed`, error);
    return { ok: false, code: "backend_error" };
  }
}
