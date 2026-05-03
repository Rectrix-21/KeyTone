const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = Number(process.env.PORT ?? 5000);
const MODEL = process.env.DEMUCS_MODEL || "htdemucs";
const UPLOAD_DIR = path.join(__dirname, "uploads");
const OUTPUT_DIR = path.join(__dirname, "output");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const upload = multer({ storage });

app.use(cors({ origin: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

function quotePath(value) {
  return `"${String(value).replace(/\"/g, '\\"')}"`;
}

app.post("/extract", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing file" });
  }

  const inputPath = req.file.path;
  const command = `demucs -n ${MODEL} -o ${quotePath(OUTPUT_DIR)} ${quotePath(inputPath)}`;

  exec(
    command,
    { maxBuffer: 10 * 1024 * 1024 },
    async (error, stdout, stderr) => {
      if (stderr) {
        console.error(stderr);
      }

      const cleanup = fs.promises.unlink(inputPath).catch(() => undefined);

      if (error) {
        await cleanup;
        return res.status(500).json({ error: "Extraction failed" });
      }

      const baseName = path.parse(inputPath).name;
      const expectedOutputDir = path.join(OUTPUT_DIR, MODEL, baseName);

      await cleanup;
      return res.json({ status: "ok", outputDir: expectedOutputDir });
    },
  );
});

app.listen(PORT, () => {
  console.log(`KeyTone Studio companion running on http://localhost:${PORT}`);
});
