/**
 * 系統設定
 * 第一階段 USE_MOCK = true；日後改接 Google Apps Script 只需改此檔與 api.js
 */
export const config = {
  USE_MOCK: false,
  /** 填入後將 USE_MOCK 改成 false；publishable/anon key 可以放在瀏覽器端。 */
  SUPABASE_URL: "https://dlzdupbbfddqghlbixhb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_nAnSRzMHlW3v5_C-DE6atg_YmANWVNq",
  /** 未來 GAS Web App 網址，例如 https://script.google.com/macros/s/xxxxx/exec */
  API_BASE_URL: "",
  SESSION_KEY: "campus_order_session",
  GUEST_KEY: "campus_order_guest",
  CART_KEY: "campus_order_cart",
  MOCK_DB_KEY: "campus_order_mock_db",
  LANG_KEY: "campus_order_lang",
  MOCK_DB_VERSION: 2,
};
