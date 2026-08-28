import { config, loadConfig } from "./config.js";

let clientPromise;

function showBackendError(message = "後端連線失敗，請檢查 Supabase 設定後重試。") {
  if (typeof document === "undefined" || !document.body || document.querySelector("[data-backend-notice]")) return;
  const notice = document.createElement("div");
  notice.className = "notice error";
  notice.dataset.backendNotice = "true";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  document.body.prepend(notice);
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (/backend_unavailable|Supabase 尚未設定|Failed to fetch|NetworkError/.test(event.message || "")) {
      event.preventDefault();
      showBackendError();
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (/backend_unavailable|Supabase 尚未設定|Failed to fetch|NetworkError/.test(String(event.reason?.message || event.reason))) {
      event.preventDefault();
      showBackendError();
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
    showBackendError("Supabase 尚未設定，請設定 Project URL 與 publishable key。");
    throw new Error("Supabase 尚未設定。請設定 SUPABASE_URL 與 SUPABASE_ANON_KEY。");
  }
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").then(
      ({ createClient }) =>
        createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.sessionStorage,
          },
        })
    );
  }
  return clientPromise;
}

export async function rpc(name, args = {}) {
  try {
    const client = await getSupabase();
    const { data, error } = await client.rpc(name, args);
    if (error) {
      console.error(`Supabase RPC ${name} failed`, error);
      return { ok: false, code: "backend_error", message: error.message };
    }
    return data;
  } catch (error) {
    console.error(`Supabase RPC ${name} failed`, error);
    return { ok: false, code: "backend_error", message: error.message };
  }
}
