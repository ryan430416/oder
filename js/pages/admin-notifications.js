import { runAdminPage } from "../admin-boot.js";
import { renderNoticeList } from "./notices.js";

await runAdminPage(async () => {
await renderNoticeList();
});
