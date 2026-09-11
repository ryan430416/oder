const DEFAULT_POCKETBASE_URL = "https://db.keson.pro";

export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  const url = String(process.env.POCKETBASE_URL || DEFAULT_POCKETBASE_URL).trim().replace(/\/$/, "");
  response.status(200).json({
    POCKETBASE_URL: url,
    APP_ENV: process.env.APP_ENV || "production",
    SHOW_TEST_ACCOUNT: process.env.SHOW_TEST_ACCOUNT === "true",
    // Never expose credentials; only whether trusted /api/app/* can run.
    SERVER_ADMIN_CONFIGURED: Boolean(
      String(process.env.POCKETBASE_ADMIN_EMAIL || "").trim() &&
        String(process.env.POCKETBASE_ADMIN_PASSWORD || "").trim()
    ),
  });
}
