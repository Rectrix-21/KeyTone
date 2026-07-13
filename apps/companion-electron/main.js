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
const { pathToFileURL } = require("url");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT ?? 5000);
const MODEL = process.env.DEMUCS_MODEL || "htdemucs_6s";
const DEMUCS_CMD = process.env.DEMUCS_CMD || "python -m demucs";
const TRAY_ICON_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
const STEM_ORDER = ["drums", "bass", "vocals", "other", "piano", "guitar"];
const STEM_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".m4a",
  ".aac",
  ".opus",
]);
const MANAGED_VENV_DIR = "runtime-venv";
const FFMPEG_RELATIVE_DIR = path.join("resources", "ffmpeg", "bin");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let activeDemucsCommand = DEMUCS_CMD;
const PYTHON_CANDIDATES = ["python", "py", "python3"];
let appBaseDir = null;
const singleInstanceLock = app.requestSingleInstanceLock();

function focusMainWindow() {
  if (!mainWindow) {
    createWindow();
  }

  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

if (!singleInstanceLock) {
  app.quit();
}

if (singleInstanceLock) {
  app.on("second-instance", () => {
    focusMainWindow();
  });
}

function resolveBundledFfmpegPath() {
  const baseDirs = app.isPackaged
    ? [path.join(process.resourcesPath, "ffmpeg", "bin")]
    : [
        path.join(__dirname, FFMPEG_RELATIVE_DIR),
        path.join(__dirname, "resources", "ffmpeg"),
        path.join(__dirname, "node_modules", "ffmpeg-static"),
      ];

  const candidates = baseDirs.flatMap((binDir) => [
    path.join(binDir, "ffmpeg.exe"),
    path.join(binDir, "ffmpeg"),
  ]);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function configureProcessEnvironment(baseDir) {
  const ffmpegPath = resolveBundledFfmpegPath();

  if (ffmpegPath) {
    const ffmpegDir = path.dirname(ffmpegPath);
    process.env.FFMPEG_BINARY = ffmpegPath;
    process.env.IMAGEIO_FFMPEG_EXE = ffmpegPath;
    process.env.FFMPEG_EXE = ffmpegPath;
    process.env.FFMPEG_PATH = ffmpegPath;
    process.env.TORCHCODEC_FFMPEG_BINARY = ffmpegPath;
    process.env.TORCHCODEC_FFMPEG_PATH = ffmpegPath;
    process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
  }

  if (baseDir) {
    process.env.KEYTONE_STUDIO_BASE_DIR = baseDir;
  }
}

function resolveBaseDir() {
  if (app.isPackaged) {
    return app.getPath("userData");
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

function isStemAudioFile(entry) {
  return STEM_AUDIO_EXTENSIONS.has(path.extname(entry).toLowerCase());
}

function normalizeDemucsLogLine(line) {
  const text = String(line || "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\r/g, " ")
    .trim();

  if (!text) {
    return null;
  }

  if (
    (text.includes("|") && /[%]|[#█▇▆▅▄▃▂▁]/.test(text)) ||
    /\b(?:it|s)\/s\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*s\b/i.test(text) ||
    /^[#\s|█▉▊▋▌▍▎▏\d.%/\\-]+$/.test(text)
  ) {
    return null;
  }

  return text;
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getManagedVenvDir(baseDir) {
  return path.join(baseDir, MANAGED_VENV_DIR);
}

function getManagedPythonPath(baseDir) {
  const venvDir = getManagedVenvDir(baseDir);
  if (process.platform === "win32") {
    return path.join(venvDir, "Scripts", "python.exe");
  }
  return path.join(venvDir, "bin", "python3");
}

function buildDemucsError(error, stderr) {
  const detail =
    trimMessage(stderr) || trimMessage(error?.message) || "Unknown error";
  if (/not recognized|not found/i.test(detail)) {
    return "Demucs CLI not found. Install with 'pip install demucs' and make sure it is on PATH, or set DEMUCS_CMD=python -m demucs.";
  }
  return `Extraction failed: ${detail}`;
}

function runCommand(command, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          const detail = trimMessage(stderr) || trimMessage(error?.message);
          reject(
            new Error(
              detail
                ? `Command failed (${command}): ${detail}`
                : `Command failed (${command})`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

async function commandExists(command) {
  try {
    await runCommand(`${command} --version`, 15000);
    return true;
  } catch {
    return false;
  }
}

async function canRunPythonCommand(command) {
  try {
    await runCommand(`${command} -V`, 20000);
    return true;
  } catch {
    return false;
  }
}

async function findHostPythonCommand() {
  for (const candidate of PYTHON_CANDIDATES) {
    if (await commandExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildDemucsEnv() {
  const env = { ...process.env };
  const ffmpegPath = resolveBundledFfmpegPath();

  if (ffmpegPath) {
    const ffmpegDir = path.dirname(ffmpegPath);

    env.FFMPEG_BINARY = ffmpegPath;
    env.FFMPEG_EXE = ffmpegPath;
    env.FFMPEG_PATH = ffmpegPath;
    env.IMAGEIO_FFMPEG_EXE = ffmpegPath;
    env.TORCHCODEC_FFMPEG_BINARY = ffmpegPath;
    env.TORCHCODEC_FFMPEG_PATH = ffmpegPath;
    env.PATH = `${ffmpegDir};${process.env.PATH}`;
  }

  return env;
}

async function verifyBundledFfmpeg() {
  const ffmpegPath = resolveBundledFfmpegPath();
  if (!ffmpegPath) {
    console.warn("[FFmpeg] Bundled binary not found.");
    return false;
  }

  await new Promise((resolve, reject) => {
    exec(
      `${quotePath(ffmpegPath)} -version`,
      { maxBuffer: 2 * 1024 * 1024, env: buildDemucsEnv() },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              trimMessage(stderr) ||
                trimMessage(error.message) ||
                "ffmpeg check failed",
            ),
          );
          return;
        }

        console.log(`[FFmpeg] Bundled binary available at ${ffmpegPath}`);
        console.log(trimMessage(stdout, 300));
        resolve(true);
      },
    );
  });

  return true;
}

async function ensureManagedVenv(baseDir) {
  const pythonPath = getManagedPythonPath(baseDir);
  if (pathExists(pythonPath)) {
    return pythonPath;
  }

  const hostPython = await findHostPythonCommand();
  if (!hostPython) {
    throw new Error("Python not found. Please install Python 3.10+.");
  }

  const venvDir = getManagedVenvDir(baseDir);
  await runCommand(
    `${hostPython} -m venv ${quotePath(venvDir)}`,
    6 * 60 * 1000,
  );

  if (!pathExists(pythonPath)) {
    throw new Error("Failed to create managed Python runtime.");
  }

  return pythonPath;
}

async function installPackagesIntoManagedVenv(baseDir, packages) {
  const pythonPath = await ensureManagedVenv(baseDir);
  const pythonCmd = quotePath(pythonPath);

  await runCommand(`${pythonCmd} -m pip --version`, 30000);
  await runCommand(
    `${pythonCmd} -m pip install --upgrade pip setuptools wheel`,
    10 * 60 * 1000,
  );
  await runCommand(
    `${pythonCmd} -m pip install ${packages.join(" ")}`,
    30 * 60 * 1000,
  );

  // Copy bundled FFmpeg into venv's Scripts folder so it's on PATH
  const ffmpegSourcePath = resolveBundledFfmpegPath();
  if (ffmpegSourcePath && pathExists(ffmpegSourcePath)) {
    const venvDir = getManagedVenvDir(baseDir);
    const venvScriptsDir =
      process.platform === "win32"
        ? path.join(venvDir, "Scripts")
        : path.join(venvDir, "bin");
    ensureDir(venvScriptsDir);

    const ffmpegDestPath = path.join(venvScriptsDir, "ffmpeg.exe");
    try {
      fs.copyFileSync(ffmpegSourcePath, ffmpegDestPath);
      console.log(`[FFmpeg] Copied to venv: ${ffmpegDestPath}`);
    } catch (err) {
      console.warn(`[FFmpeg] Failed to copy to venv: ${err.message}`);
    }
  }

  return pythonPath;
}

async function resolveDemucsCommand() {
  if (appBaseDir) {
    const managedPythonPath = getManagedPythonPath(appBaseDir);
    if (pathExists(managedPythonPath)) {
      const managedDemucsCommand = `${quotePath(managedPythonPath)} -m demucs`;
      try {
        await runCommand(`${managedDemucsCommand} --help`, 20000);
        return managedDemucsCommand;
      } catch {
        // Fall back to global candidates.
      }
    }
  }

  const candidates = [DEMUCS_CMD, "python -m demucs", "py -m demucs", "demucs"];
  for (const candidate of candidates) {
    try {
      await runCommand(`${candidate} --help`, 20000);
      return candidate;
    } catch {
      // Try next command.
    }
  }
  return null;
}

async function getEngineStatus() {
  const command = await resolveDemucsCommand();
  if (!command) {
    return {
      ready: false,
      command: null,
      message: "AI engine not installed",
    };
  }

  activeDemucsCommand = command;
  return {
    ready: true,
    command,
    message: "AI engine ready",
  };
}

async function installDemucsEngine() {
  const baseDir = appBaseDir || resolveBaseDir();
  const managedPythonPath = await installPackagesIntoManagedVenv(baseDir, [
    "demucs",
    "torchcodec",
  ]);
  activeDemucsCommand = `${quotePath(managedPythonPath)} -m demucs`;

  const status = await getEngineStatus();
  if (!status.ready) {
    throw new Error(
      "Demucs installation finished, but the command is still unavailable.",
    );
  }

  return status;
}

function getPythonFromDemucsCommand(command) {
  const match = String(command).match(/^(.*)\s+-m\s+demucs\b/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

async function installPackageInAvailablePythons(packageName, preferredPython) {
  const tried = new Set();
  const managedCandidate =
    appBaseDir && pathExists(getManagedPythonPath(appBaseDir))
      ? quotePath(getManagedPythonPath(appBaseDir))
      : null;
  const orderedCandidates = [
    preferredPython,
    managedCandidate,
    ...PYTHON_CANDIDATES,
  ].filter(Boolean);

  for (const candidate of orderedCandidates) {
    if (tried.has(candidate)) {
      continue;
    }
    tried.add(candidate);

    if (!(await canRunPythonCommand(candidate))) {
      continue;
    }

    try {
      await runCommand(`${candidate} -m pip --version`, 30000);
      const userFlag = /^(python|py|python3)$/i.test(candidate)
        ? " --user"
        : "";
      await runCommand(
        `${candidate} -m pip install${userFlag} ${packageName}`,
        20 * 60 * 1000,
      );
      return candidate;
    } catch {
      // Try next runtime.
    }
  }

  return null;
}

function emitExtractionProgress(target, payload) {
  if (typeof target !== "function") {
    return;
  }

  target(payload);
}

function estimateDemucsProgress(message) {
  const text = String(message || "").toLowerCase();

  if (!text) {
    return null;
  }
  if (text.includes("selected model")) {
    return 12;
  }
  if (text.includes("separating track")) {
    return 35;
  }
  if (text.includes("writing") || text.includes("saving")) {
    return 78;
  }
  if (text.includes("done") || text.includes("completed")) {
    return 95;
  }

  return null;
}

function execDemucs(command, onProgress) {
  return new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const child = exec(command, {
      maxBuffer: 10 * 1024 * 1024,
      env: buildDemucsEnv(),
    });

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutChunks.push(text);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const normalizedLine = normalizeDemucsLogLine(line);
        if (!normalizedLine) {
          continue;
        }
        emitExtractionProgress(onProgress, {
          message: normalizedLine,
          percent: estimateDemucsProgress(normalizedLine),
          stream: "stdout",
        });
      }
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderrChunks.push(text);
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const normalizedLine = normalizeDemucsLogLine(line);
        if (!normalizedLine) {
          continue;
        }
        emitExtractionProgress(onProgress, {
          message: normalizedLine,
          percent: estimateDemucsProgress(normalizedLine),
          stream: "stderr",
        });
      }
    });

    child.on("error", (error) => {
      reject({
        error,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });

    child.on("close", (code) => {
      const stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      if (code !== 0) {
        reject({
          error: new Error(`Demucs exited with code ${code}`),
          stdout,
          stderr,
        });
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runDemucs(inputPath, outputDir, selectedStems, onProgress) {
  let status = await getEngineStatus();
  if (!status.ready) {
    await installDemucsEngine();
    status = await getEngineStatus();
  }

  if (!status.ready) {
    throw new Error(
      "AI engine is missing. Click 'Install AI Engine' in KeyTone Studio first.",
    );
  }

  const baseName = path.parse(inputPath).name;
  const expectedOutputDir = path.join(outputDir, MODEL, baseName);
  const baseArgs = `-n ${MODEL} --mp3 -o ${quotePath(outputDir)} ${quotePath(inputPath)}`;
  const runCommandText = `${activeDemucsCommand} ${baseArgs}`;

  try {
    emitExtractionProgress(onProgress, {
      message: "Starting Demucs extraction...",
      percent: 5,
      stream: "system",
    });
    await execDemucs(runCommandText, onProgress);
    emitExtractionProgress(onProgress, {
      message: "Removing unselected stems...",
      percent: 90,
      stream: "system",
    });
    await pruneUnselectedStemOutputs(expectedOutputDir, selectedStems);
  } catch (result) {
    const detail =
      trimMessage(result?.stderr) ||
      trimMessage(result?.stdout) ||
      trimMessage(result?.error?.message);

    const missingModuleMatch = String(detail).match(
      /No module named ['\"]([^'\"]+)['\"]/i,
    );

    if (missingModuleMatch && missingModuleMatch[1]) {
      const missingModule = missingModuleMatch[1];
      const preferredPython = getPythonFromDemucsCommand(activeDemucsCommand);
      const installedWith = await installPackageInAvailablePythons(
        missingModule,
        preferredPython,
      );

      if (installedWith) {
        try {
          await execDemucs(runCommandText, onProgress);
          emitExtractionProgress(onProgress, {
            message: "Removing unselected stems...",
            percent: 90,
            stream: "system",
          });
          await pruneUnselectedStemOutputs(expectedOutputDir, selectedStems);
          return expectedOutputDir;
        } catch (retryResult) {
          throw new Error(
            buildDemucsError(
              retryResult?.error,
              retryResult?.stderr || retryResult?.stdout,
            ),
          );
        }
      }

      throw new Error(
        `Missing dependency '${missingModule}'. Auto-install failed. Click 'Install AI Engine' again.`,
      );
    }

    if (
      activeDemucsCommand === "demucs" &&
      /not recognized|not found/i.test(detail)
    ) {
      try {
        await execDemucs(`python -m demucs ${baseArgs}`, onProgress);
        emitExtractionProgress(onProgress, {
          message: "Removing unselected stems...",
          percent: 90,
          stream: "system",
        });
        await pruneUnselectedStemOutputs(expectedOutputDir, selectedStems);
      } catch (fallbackResult) {
        throw new Error(
          buildDemucsError(
            fallbackResult?.error,
            fallbackResult?.stderr || fallbackResult?.stdout,
          ),
        );
      }
    } else {
      throw new Error(
        buildDemucsError(result?.error, result?.stderr || result?.stdout),
      );
    }
  }

  emitExtractionProgress(onProgress, {
    message: "Extraction complete.",
    percent: 100,
    stream: "system",
  });

  return expectedOutputDir;
}

async function listStemOutputs(outputDirPath, selectedStems) {
  const stemSet = new Set(
    Array.isArray(selectedStems)
      ? selectedStems.map((stem) => String(stem).toLowerCase())
      : [],
  );
  const entries = await fs.promises.readdir(outputDirPath).catch(() => []);
  const stems = entries
    .filter((entry) => isStemAudioFile(entry))
    .map((entry) => {
      const stemName = path.parse(entry).name.toLowerCase();
      return {
        stem: stemName,
        path: path.join(outputDirPath, entry),
      };
    })
    .filter((entry) => (stemSet.size ? stemSet.has(entry.stem) : true));

  stems.sort((a, b) => STEM_ORDER.indexOf(a.stem) - STEM_ORDER.indexOf(b.stem));
  return stems;
}

async function pruneUnselectedStemOutputs(outputDirPath, selectedStems) {
  const stemSet = new Set(
    Array.isArray(selectedStems)
      ? selectedStems.map((stem) => String(stem).toLowerCase())
      : [],
  );

  if (stemSet.size === 0) {
    return;
  }

  const entries = await fs.promises.readdir(outputDirPath).catch(() => []);
  const removals = entries
    .filter((entry) => isStemAudioFile(entry))
    .filter((entry) => {
      const stemName = path.parse(entry).name.toLowerCase();
      return !stemSet.has(stemName);
    })
    .map((entry) =>
      fs.promises
        .unlink(path.join(outputDirPath, entry))
        .catch(() => undefined),
    );

  await Promise.all(removals);
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
      const stems = await listStemOutputs(outputDirPath);
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      return res.json({ status: "ok", outputDir: outputDirPath, stems });
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      return res
        .status(500)
        .json({ error: error?.message || "Extraction failed" });
    }
  });

  server.listen(PORT, () => {
    console.log(`KeyTone Studio API running on http://localhost:${PORT}`);
  });

  return { uploadDir, outputDir };
}

function resolveLogoPath() {
  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "logo.png")
    : path.join(__dirname, "..", "..", "public", "logo.png");

  return pathToFileURL(logoPath).href;
}

function resolveLogoFilePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "logo.png")
    : path.join(__dirname, "..", "..", "public", "logo.png");
}

async function selectOutputFolder() {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    backgroundColor: "#050608",
    title: "KeyTone Studio",
    icon: resolveLogoFilePath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  return mainWindow;
}

function createTray() {
  if (!mainWindow) {
    return;
  }

  const icon = nativeImage.createFromPath(resolveLogoFilePath());
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

if (singleInstanceLock) {
  app.whenReady().then(() => {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    });

    const baseDir = resolveBaseDir();
    appBaseDir = baseDir;
    ensureDir(baseDir);
    configureProcessEnvironment(baseDir);
    void verifyBundledFfmpeg().catch((error) => {
      console.warn(`[FFmpeg] Bundled binary check failed: ${error.message}`);
    });
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

    ipcMain.handle(
      "extract-local",
      async (event, filePath, selectedStems, outputDirPath) => {
        if (!filePath) {
          throw new Error("Missing file");
        }
        const targetOutputDir = outputDirPath || outputDir;
        ensureDir(targetOutputDir);
        const resolvedOutputDirPath = await runDemucs(
          filePath,
          targetOutputDir,
          selectedStems,
          (payload) => event.sender.send("extract-progress", payload),
        );
        const stems = await listStemOutputs(
          resolvedOutputDirPath,
          selectedStems,
        );
        return { outputDir: resolvedOutputDirPath, stems };
      },
    );

    ipcMain.handle("select-output-folder", async () => selectOutputFolder());

    ipcMain.handle("get-logo-path", async () => resolveLogoPath());

    ipcMain.handle("open-folder", async (_event, targetPath) => {
      if (!targetPath) {
        return false;
      }
      await shell.openPath(targetPath);
      return true;
    });

    ipcMain.handle("engine-status", async () => getEngineStatus());

    ipcMain.handle("engine-install", async () => {
      try {
        const status = await installDemucsEngine();
        return { ok: true, ...status };
      } catch (error) {
        return {
          ok: false,
          ready: false,
          message: error?.message || "AI engine install failed",
        };
      }
    });

    createWindow();
    createTray();

    app.on("activate", () => {
      focusMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
