import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "pocketbase");
const binary = join(ROOT, process.platform === "win32" ? "pocketbase.exe" : "pocketbase");

if (!existsSync(binary)) {
  console.error("找不到 PocketBase 程式。請先執行：npm run pb:download");
  process.exit(1);
}

const child = spawn(binary, ["serve", "--http=127.0.0.1:8090"], {
  cwd: ROOT,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
