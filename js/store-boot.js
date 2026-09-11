import { auth } from "./auth.js";
import { initI18n } from "./i18n.js";
import { goToPage } from "./nav.js";

/**
 * Store gate: redirects to login with reason=session_expired when needed.
 * Returns null after redirect — callers must not throw.
 */
export async function bootStore() {
  initI18n();
  const session = await auth.requireRole("store", "index.html");
  if (!session || session.role !== "store") {
    return null;
  }
  document.querySelectorAll("#logout").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await auth.logout();
      goToPage("index.html");
    });
  });
  return session;
}

/** Run store page body only when session is valid; never throw on expiry. */
export async function runStorePage(init) {
  const session = await bootStore();
  if (!session) return null;
  await init(session);
  return session;
}
