import { initI18n } from "../i18n.js";
import { auth } from "../auth.js";
import { renderNoticeList } from "./notices.js";

initI18n();
if (!(await auth.ensureCustomer())) throw new Error("backend_unavailable");
await renderNoticeList();
