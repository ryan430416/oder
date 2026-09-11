import { initI18n } from "../i18n.js";
import { auth } from "../auth.js";
import { qs } from "../nav.js";
import { renderNoticeList } from "./notices.js";
import { hideBackendNotice, renderBackendNotice } from "../backend-ui.js";
import { shouldQueryCustomerData } from "../guest-session.js";

initI18n();

const list = qs("#list");
const statusEl = qs("#noticeStatus");

async function boot() {
  const result = await auth.ensureCustomer();
  if (!shouldQueryCustomerData(result)) {
    list.innerHTML = "";
    renderBackendNotice(statusEl, {
      code: result?.code || "anonymous_login_failed",
      onRetry: () => boot(),
    });
    return;
  }
  hideBackendNotice(statusEl);
  await renderNoticeList();
}

boot();
