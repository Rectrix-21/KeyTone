import { cp, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(
  webRoot,
  "node_modules",
  "essentia.js",
  "dist",
  "essentia-wasm.web.wasm",
);
const destinationDir = path.join(webRoot, "public", "essentia");
const destinationPath = path.join(destinationDir, "essentia-wasm.web.wasm");

async function run() {
  await access(sourcePath, constants.R_OK);
  await mkdir(destinationDir, { recursive: true });
  await cp(sourcePath, destinationPath, { force: true });
  process.stdout.write(
    "Copied Essentia WASM to public/essentia/essentia-wasm.web.wasm\n",
  );
}

run().catch((error) => {
  process.stderr.write(`Failed to copy Essentia WASM: ${error.message}\n`);
  process.exit(1);
});
