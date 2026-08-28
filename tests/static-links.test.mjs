import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(".");

async function htmlFiles(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "playwright-report", "test-results"].includes(entry)) continue;
    const path = join(directory, entry);
    const details = await stat(path);
    if (details.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

test("local HTML links and assets exist", async () => {
  const missing = [];
  for (const file of await htmlFiles(root)) {
    const html = await readFile(file, "utf8");
    const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const ref of refs) {
      if (/^(?:https?:|mailto:|#|javascript:)/.test(ref)) continue;
      const target = resolve(dirname(file), ref.split(/[?#]/)[0]);
      try {
        await stat(target);
      } catch {
        missing.push(`${file.slice(root.length + 1)} -> ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
