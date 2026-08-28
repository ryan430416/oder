import { bootAdmin } from "../admin-boot.js";
import { renderNoticeList } from "./notices.js";

if (!(await bootAdmin())) throw new Error("admin");
await renderNoticeList();
