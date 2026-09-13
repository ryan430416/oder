import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIRM = "--confirm-delete-deletetest";
const PREFIX = "guest_deletetest_";

async function loadEnv() {
  const text = await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

export function matchingDeletetestAccounts(items) {
  return (items || []).filter((item) => String(item.email || "").startsWith(PREFIX));
}

export function deletionAllowed(argv = process.argv.slice(2)) {
  return argv.includes(CONFIRM);
}

async function main() {
  const env = await loadEnv();
  const url = String(env.POCKETBASE_URL || "").replace(/\/$/, "");
  if (!url || !env.POCKETBASE_ADMIN_EMAIL || !env.POCKETBASE_ADMIN_PASSWORD) {
    console.error("Missing PocketBase admin settings in .env");
    process.exitCode = 1;
    return;
  }
  const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: env.POCKETBASE_ADMIN_EMAIL,
      password: env.POCKETBASE_ADMIN_PASSWORD,
    }),
  });
  if (!auth.ok) {
    console.error("Superuser login failed");
    process.exitCode = 1;
    return;
  }
  const token = (await auth.json()).token;
  const listed = await fetch(
    `${url}/api/collections/oder_users/records?perPage=50&filter=${encodeURIComponent(`email~"${PREFIX}"`)}`,
    { headers: { Authorization: token } }
  );
  const data = await listed.json();
  const matches = matchingDeletetestAccounts(data.items);
  if (!matches.length) {
    console.log("No guest_deletetest_ accounts found.");
    return;
  }
  for (const item of matches) console.log(`${item.id} ${item.email}`);
  if (!deletionAllowed()) {
    console.log(`Listed ${matches.length} account(s). Nothing was deleted.`);
    console.log(`Re-run with ${CONFIRM} only after you have reviewed this list.`);
    return;
  }
  for (const item of matches) {
    const removed = await fetch(`${url}/api/collections/oder_users/records/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: token },
    });
    console.log(removed.ok ? `deleted ${item.email}` : `failed ${item.email} ${removed.status}`);
  }
}

const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "cleanup failed");
    process.exitCode = 1;
  });
}
