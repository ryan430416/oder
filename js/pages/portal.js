import { initI18n } from "../i18n.js";
import { config, loadConfig } from "../config.js";
import { mountIcons } from "../icons.js";
initI18n();
mountIcons();
await loadConfig();
const hint = document.querySelector(".hint");
if (hint) hint.hidden = !config.SHOW_TEST_ACCOUNT;
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
  const notice = document.createElement("p");
  notice.className = "notice error";
  notice.textContent = "Supabase 尚未設定，請先完成環境變數設定。";
  document.querySelector(".portal")?.prepend(notice);
}
