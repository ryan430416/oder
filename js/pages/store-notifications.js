import { runStorePage } from "../store-boot.js";
import { renderNoticeList } from "./notices.js";

await runStorePage(async () => {
  await renderNoticeList();
});
