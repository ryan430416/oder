import { createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const VERSION = "0.40.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "pocketbase");

function assetName() {
  const platform = process.platform;
  const arch = process.arch;
  const map = {
    "win32-x64": "windows_amd64",
    "win32-arm64": "windows_arm64",
    "darwin-x64": "darwin_amd64",
    "darwin-arm64": "darwin_arm64",
    "linux-x64": "linux_amd64",
    "linux-arm64": "linux_arm64",
  };
  const id = map[`${platform}-${arch}`];
  if (!id) throw new Error(`Unsupported platform: ${platform} ${arch}`);
  return `pocketbase_${VERSION}_${id}.zip`;
}

const binaryName = process.platform === "win32" ? "pocketbase.exe" : "pocketbase";
if (existsSync(join(ROOT, binaryName))) {
  console.log(`PocketBase already downloaded: ${join(ROOT, binaryName)}`);
  process.exit(0);
}

await mkdir(ROOT, { recursive: true });
const zipName = assetName();
const zipPath = join(ROOT, zipName);
const url = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${zipName}`;
console.log(`Downloading ${url}`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Download failed: ${response.status} ${await response.text()}`);
await pipeline(response.body, createWriteStream(zipPath));
execFileSync("tar", ["-xf", zipName], { cwd: ROOT, stdio: "inherit" });
await unlink(zipPath);
console.log(`Ready: ${join(ROOT, binaryName)}`);
console.log("Next: npm run pb:serve");
