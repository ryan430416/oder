/**
 * 系統設定
 * 第一階段 USE_MOCK = true；日後改接 Google Apps Script 只需改此檔與 api.js
 */
export const config = {
  USE_MOCK: true,
  /** 未來 GAS Web App 網址，例如 https://script.google.com/macros/s/xxxxx/exec */
  API_BASE_URL: "",
  SESSION_KEY: "campus_order_session",
  CART_KEY: "campus_order_cart",
  MOCK_DB_KEY: "campus_order_mock_db",
  LANG_KEY: "campus_order_lang",
};
