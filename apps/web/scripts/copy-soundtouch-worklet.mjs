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
  "@soundtouchjs",
  "audio-worklet",
  ".dist",
  "soundtouch-processor.js",
);
const destinationDir = path.join(webRoot, "public", "soundtouch");
const destinationPath = path.join(destinationDir, "soundtouch-processor.js");

async function run() {
  await access(sourcePath, constants.R_OK);
  await mkdir(destinationDir, { recursive: true });
  await cp(sourcePath, destinationPath, { force: true });
  process.stdout.write(
    "Copied SoundTouch processor to public/soundtouch/soundtouch-processor.js\n",
  );
}

run().catch((error) => {
  process.stderr.write(`Failed to copy SoundTouch processor: ${error.message}\n`);
  process.exit(1);
});
