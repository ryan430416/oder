/** Runtime values come from /api/config (Vercel) or ignored config.local.js. */
export const config = {
  POCKETBASE_URL: "",
  APP_ENV: "production",
  SHOW_TEST_ACCOUNT: false,
  CART_KEY: "campus_order_cart",
  LANG_KEY: "campus_order_lang",
};

let configPromise;

export function sanitizePocketBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/$/, "");
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  if (typeof location !== "undefined" && location.protocol === "https:" && parsed.protocol !== "https:") {
    return "";
  }
  return parsed.origin;
}

export function loadConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      let values = {};
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (response.ok) values = await response.json();
      } catch {
        // Local static servers use an ignored js/config.local.js file.
      }
      if (!sanitizePocketBaseUrl(values.POCKETBASE_URL)) {
        try {
          values = { ...values, ...((await import("./config.local.js")).localConfig || {}) };
        } catch {
          // Keep empty until a valid HTTPS/HTTP origin is provided.
        }
      }
      Object.assign(
        config,
        Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "" && value != null))
      );
      config.POCKETBASE_URL = sanitizePocketBaseUrl(config.POCKETBASE_URL);
      config.SHOW_TEST_ACCOUNT =
        config.SHOW_TEST_ACCOUNT === true || String(config.SHOW_TEST_ACCOUNT) === "true";
      return config;
    })();
  }
  return configPromise;
}
