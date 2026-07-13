const serverStatus = document.getElementById("serverStatus");
const selectFileBtn = document.getElementById("selectFileBtn");
const extractBtn = document.getElementById("extractBtn");
const fileRow = document.getElementById("fileRow");
const progress = document.getElementById("progress");
const output = document.getElementById("output");
const stemOutput = document.getElementById("stemOutput");
const openFolderBtn = document.getElementById("openFolderBtn");
const stemGrid = document.getElementById("stemGrid");
const installEngineBtn = document.getElementById("installEngineBtn");
const engineStatus = document.getElementById("engineStatus");
const selectOutputDirBtn = document.getElementById("selectOutputDirBtn");
const outputDirRow = document.getElementById("outputDirRow");
const appLogo = document.getElementById("appLogo");
const progressFill = document.getElementById("progressFill");

let selectedFilePath = null;
let lastOutputDir = null;
let engineReady = false;
let engineBusy = false;
let selectedOutputDir = null;
const selectedStems = new Set();

function refreshOutputDirLabel() {
  if (outputDirRow) {
    outputDirRow.textContent = selectedOutputDir
      ? selectedOutputDir
      : "Using app default output folder.";
  }
}

function updateProgressState(message, percent) {
  if (progress) {
    progress.textContent = message || "Processing locally...";
  }

  if (progressFill) {
    const hasPercent = Number.isFinite(percent);
    progressFill.style.width = hasPercent
      ? `${Math.max(0, Math.min(100, percent))}%`
      : "72%";
    progressFill.classList.toggle(
      "progress-bar__fill--indeterminate",
      !hasPercent,
    );
  }
}

async function checkServer() {
  try {
    const response = await fetch("http://localhost:5000/health");
    if (!response.ok) {
      throw new Error("Not running");
    }
    serverStatus.textContent = "Local API ready";
    serverStatus.classList.add("status--ok");
  } catch {
    serverStatus.textContent = "Local API offline";
    serverStatus.classList.remove("status--ok");
  }
}

async function refreshEngineStatus() {
  if (engineBusy) {
    return;
  }

  try {
    if (!window.keytone || !window.keytone.getEngineStatus) {
      engineReady = false;
      engineStatus.textContent =
        "Desktop bridge unavailable. Please restart KeyTone Studio.";
      return;
    }

    const status = await window.keytone.getEngineStatus();
    engineReady = Boolean(status && status.ready);
    engineStatus.textContent = engineReady
      ? "AI engine ready"
      : "AI engine missing - click Install AI Engine";
  } catch (error) {
    engineReady = false;
    engineStatus.textContent =
      error && error.message ? error.message : "Unable to verify AI engine";
  }
}

async function loadLogo() {
  if (!appLogo || !window.keytone || !window.keytone.getLogoPath) {
    return;
  }

  try {
    const logoPath = await window.keytone.getLogoPath();
    if (logoPath) {
      appLogo.src = logoPath;
    }
  } catch {
    // If the asset cannot be resolved, keep the app text-only.
  }
}

if (window.keytone && window.keytone.onExtractProgress) {
  window.keytone.onExtractProgress((payload) => {
    updateProgressState(payload?.message, payload?.percent);
  });
}

installEngineBtn.addEventListener("click", async () => {
  engineBusy = true;
  installEngineBtn.disabled = true;
  engineStatus.textContent =
    "Installing AI engine... this may take a few minutes.";
  output.textContent = "";

  try {
    if (!window.keytone || !window.keytone.installEngine) {
      throw new Error("Install bridge unavailable. Please restart app.");
    }

    const status = await window.keytone.installEngine();
    engineReady = Boolean(status && status.ready);

    if (status && status.ok === false) {
      engineStatus.textContent =
        status.message || "AI engine install failed. Check Python install.";
    } else {
      engineStatus.textContent = engineReady
        ? "AI engine installed and ready"
        : "AI engine install finished, but not ready yet";
    }
  } catch (error) {
    engineReady = false;
    engineStatus.textContent =
      error && error.message ? error.message : "AI engine install failed";
  } finally {
    engineBusy = false;
    installEngineBtn.disabled = false;
    await refreshEngineStatus();
  }
});

selectFileBtn.addEventListener("click", async () => {
  const path = await window.keytone.selectAudioFile();
  if (!path) {
    return;
  }
  selectedFilePath = path;
  fileRow.textContent = path;
  extractBtn.disabled = false;
  output.textContent = "";
  stemOutput.textContent = "";
  progress.textContent = "Ready to extract";
});

if (selectOutputDirBtn) {
  selectOutputDirBtn.addEventListener("click", async () => {
    if (!window.keytone || !window.keytone.selectOutputFolder) {
      output.textContent = "Output folder picker is unavailable.";
      return;
    }

    const folderPath = await window.keytone.selectOutputFolder();
    if (!folderPath) {
      return;
    }

    selectedOutputDir = folderPath;
    refreshOutputDirLabel();
  });
}

if (stemGrid) {
  stemGrid.querySelectorAll(".stem-pill").forEach((button) => {
    button.addEventListener("click", () => {
      const stem = button.getAttribute("data-stem");
      if (!stem) {
        return;
      }
      if (selectedStems.has(stem)) {
        selectedStems.delete(stem);
        button.classList.remove("stem-pill--active");
      } else {
        selectedStems.add(stem);
        button.classList.add("stem-pill--active");
      }
    });
  });
}

extractBtn.addEventListener("click", async () => {
  if (!selectedFilePath) {
    return;
  }

  if (!engineReady) {
    output.textContent =
      "AI engine is not ready. Click 'Install AI Engine' first.";
    return;
  }

  extractBtn.disabled = true;
  selectFileBtn.disabled = true;
  updateProgressState("Processing locally...", NaN);
  output.textContent = "";
  stemOutput.textContent = "";

  try {
    const stemList = Array.from(selectedStems);
    const result = await window.keytone.extractLocal(
      selectedFilePath,
      stemList,
      selectedOutputDir,
    );
    lastOutputDir = result.outputDir || null;
    output.textContent = lastOutputDir
      ? `Done. Output: ${lastOutputDir}`
      : "Done. Output folder ready.";
    if (Array.isArray(result.stems) && result.stems.length > 0) {
      stemOutput.innerHTML = result.stems
        .map((entry) => `<div>${entry.stem}: ${entry.path}</div>`)
        .join("");
    }
    openFolderBtn.disabled = !lastOutputDir;
  } catch (error) {
    output.textContent =
      error && error.message ? error.message : "Extraction failed";
  } finally {
    extractBtn.disabled = false;
    selectFileBtn.disabled = false;
    updateProgressState("Idle", 0);
  }
});

openFolderBtn.addEventListener("click", async () => {
  if (!lastOutputDir) {
    return;
  }
  await window.keytone.openFolder(lastOutputDir);
});

refreshOutputDirLabel();
loadLogo();
checkServer();
refreshEngineStatus();
setInterval(checkServer, 5000);
setInterval(refreshEngineStatus, 15000);
