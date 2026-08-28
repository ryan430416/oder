export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    APP_ENV: process.env.APP_ENV || "production",
    SHOW_TEST_ACCOUNT: process.env.SHOW_TEST_ACCOUNT === "true",
  });
}
