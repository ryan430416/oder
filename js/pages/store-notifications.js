import { initI18n } from "../i18n.js";
import { auth } from "../auth.js";
import { renderNoticeList } from "./notices.js";

initI18n();
if (!(await auth.requireRole("store", "index.html"))) throw new Error("store");
await renderNoticeList();
