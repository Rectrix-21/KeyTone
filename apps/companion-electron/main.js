const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT ?? 5000);
const MODEL = process.env.DEMUCS_MODEL || "htdemucs";
const DEMUCS_CMD = process.env.DEMUCS_CMD || "demucs";
const TRAY_ICON_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

let mainWindow = null;
let tray = null;
let isQuitting = false;

function resolveBaseDir() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "keytone-studio");
  }
  return __dirname;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function quotePath(value) {
  return `"${String(value).replace(/\"/g, '\\"')}"`;
}

function trimMessage(value, limit = 600) {
  if (!value) {
    return "";
  }
  const message = String(value).trim();
  if (message.length <= limit) {
    return message;
  }
  return `${message.slice(0, limit)}...`;
}

function buildDemucsError(error, stderr) {
  const detail =
    trimMessage(stderr) || trimMessage(error?.message) || "Unknown error";
  if (/not recognized|not found/i.test(detail)) {
    return "Demucs CLI not found. Install with 'pip install demucs' and make sure it is on PATH, or set DEMUCS_CMD=python -m demucs.";
  }
  return `Extraction failed: ${detail}`;
}

function runDemucs(inputPath, outputDir) {
  return new Promise((resolve, reject) => {
    const command = `${DEMUCS_CMD} -n ${MODEL} -o ${quotePath(outputDir)} ${quotePath(inputPath)}`;
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (stderr) {
        console.error(stderr);
      }
      if (error) {
        reject(new Error(buildDemucsError(error, stderr)));
        return;
      }
      const baseName = path.parse(inputPath).name;
      const expectedOutputDir = path.join(outputDir, MODEL, baseName);
      resolve(expectedOutputDir);
    });
  });
}

function startLocalServer(baseDir) {
  const uploadDir = path.join(baseDir, "uploads");
  const outputDir = path.join(baseDir, "output");
  ensureDir(uploadDir);
  ensureDir(outputDir);

  const server = express();
  server.use(cors({ origin: true }));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safeName}`);
    },
  });
  const upload = multer({ storage });

  server.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  server.post("/extract", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Missing file" });
    }

    try {
      const outputDirPath = await runDemucs(req.file.path, outputDir);
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      return res.json({ status: "ok", outputDir: outputDirPath });
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      return res
        .status(500)
        .json({ error: error?.message || "Extraction failed" });
    }
  });

  server.listen(PORT, () => {
    console.log(`KeyTone Studio local API running on http://localhost:${PORT}`);
  });

  return { uploadDir, outputDir };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    backgroundColor: "#050608",
    title: "KeyTone Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  return mainWindow;
}

function createTray() {
  if (!mainWindow) {
    return;
  }

  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show KeyTone Studio",
      click: () => mainWindow.show(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip("KeyTone Studio");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow.show());
}

app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });

  const baseDir = resolveBaseDir();
  ensureDir(baseDir);
  const { outputDir } = startLocalServer(baseDir);

  ipcMain.handle("select-audio-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "m4a"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("extract-local", async (_event, filePath) => {
    if (!filePath) {
      throw new Error("Missing file");
    }
    const outputDirPath = await runDemucs(filePath, outputDir);
    return { outputDir: outputDirPath };
  });

  ipcMain.handle("open-folder", async (_event, targetPath) => {
    if (!targetPath) {
      return false;
    }
    await shell.openPath(targetPath);
    return true;
  });

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
    if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
