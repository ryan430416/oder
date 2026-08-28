/** Runtime values come from /api/config (Vercel) or ignored config.local.js. */
export const config = {
  SUPABASE_URL: "https://dlzdupbbfddqghlbixhb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_nAnSRzMHlW3v5_C-DE6atg_YmANWVNq",
  APP_ENV: "development",
  SHOW_TEST_ACCOUNT: true,
  CART_KEY: "campus_order_cart",
  LANG_KEY: "campus_order_lang",
};

let configPromise;

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
      if (!values.SUPABASE_URL) {
        try {
          values = { ...values, ...((await import("./config.local.js")).localConfig || {}) };
        } catch {
          // Keep committed public URL/anon key defaults.
        }
      }
      Object.assign(
        config,
        Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "" && value != null))
      );
      config.SHOW_TEST_ACCOUNT =
        config.SHOW_TEST_ACCOUNT === true || String(config.SHOW_TEST_ACCOUNT) === "true";
      return config;
    })();
  }
  return configPromise;
}
