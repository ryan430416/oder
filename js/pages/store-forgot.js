import { api } from "../api.js";
import { qs } from "../nav.js";
import { initI18n, t } from "../i18n.js";

initI18n();
qs("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = new FormData(e.target).get("username");
  const res = await api.requestPasswordReset(username);
  qs("#msg").textContent = res.ok ? t("forgot_sent") : t(res.code);
});
