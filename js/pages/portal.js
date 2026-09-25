import { initI18n, t } from "../i18n.js";
import { config, loadConfig } from "../config.js";
import { mountIcons } from "../icons.js";
import { pingBackend } from "../pocketbase.js";
import { createInflight } from "../ui-state.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";

initI18n();
mountIcons();

const status = document.querySelector("#backendStatus");
const gate = createInflight();

async function checkBackend() {
  const run = await gate.run(async () => {
    status.hidden = false;
    status.className = "notice";
    status.removeAttribute("role");
    status.replaceChildren();
    const pending = document.createElement("p");
    pending.textContent = t("stores_loading");
    status.append(pending);
    await loadConfig();
    const hint = document.querySelector("#testAccountHint");
    if (hint) {
      const showTestAccount = config.SHOW_TEST_ACCOUNT === true;
      hint.hidden = !showTestAccount;
      hint.textContent = showTestAccount ? t("portal_hint") : "";
    }
    const result = await pingBackend();
    if (result.ok) {
      hideBackendNotice(status);
      return;
    }
    renderBackendNotice(status, {
      code: result.code,
      busy: false,
      onRetry: checkBackend,
    });
  });
  if (run?.skipped) return;
}

await checkBackend();
