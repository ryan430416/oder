import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(".");
const SKIP = new Set(["node_modules", ".git", "playwright-report", "test-results", "supabase", "pocketbase"]);

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(html|js|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

test("runtime HTML and JS do not load or call Supabase", async () => {
  const forbidden = /supabase|create_guest_login|postgres_changes|SUPABASE_URL|SUPABASE_ANON_KEY/i;
  const hits = [];
  for (const file of await walk(root)) {
    if (file.endsWith("no-supabase.test.mjs")) continue;
    const text = await readFile(file, "utf8");
    if (forbidden.test(text)) hits.push(file.slice(root.length + 1));
  }
  assert.deepEqual(hits, []);
});
