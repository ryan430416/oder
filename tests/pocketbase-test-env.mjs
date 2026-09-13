const PRODUCTION_HOSTS = new Set(["db.keson.pro"]);

export function isProductionPocketBaseUrl(value) {
  try {
    return PRODUCTION_HOSTS.has(new URL(String(value || "")).hostname);
  } catch {
    return false;
  }
}

export function isolatedPocketBaseUrl(env = process.env) {
  const testUrl = String(env.POCKETBASE_TEST_URL || "").trim().replace(/\/$/, "");
  if (!testUrl || isProductionPocketBaseUrl(testUrl)) return "";
  const schoolUrl = String(env.POCKETBASE_URL || "").trim().replace(/\/$/, "");
  if (schoolUrl && testUrl === schoolUrl) return "";
  if (isProductionPocketBaseUrl(schoolUrl) && testUrl === schoolUrl) return "";
  return testUrl;
}
