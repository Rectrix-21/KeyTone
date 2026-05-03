const serverStatus = document.getElementById("serverStatus");
const selectFileBtn = document.getElementById("selectFileBtn");
const extractBtn = document.getElementById("extractBtn");
const fileRow = document.getElementById("fileRow");
const progress = document.getElementById("progress");
const output = document.getElementById("output");
const openFolderBtn = document.getElementById("openFolderBtn");

let selectedFilePath = null;
let lastOutputDir = null;

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

selectFileBtn.addEventListener("click", async () => {
  const path = await window.keytone.selectAudioFile();
  if (!path) {
    return;
  }
  selectedFilePath = path;
  fileRow.textContent = path;
  extractBtn.disabled = false;
  output.textContent = "";
  progress.textContent = "Ready to extract";
});

extractBtn.addEventListener("click", async () => {
  if (!selectedFilePath) {
    return;
  }

  extractBtn.disabled = true;
  selectFileBtn.disabled = true;
  progress.textContent = "Processing locally...";
  output.textContent = "";

  try {
    const result = await window.keytone.extractLocal(selectedFilePath);
    lastOutputDir = result.outputDir || null;
    output.textContent = lastOutputDir
      ? `Done. Output: ${lastOutputDir}`
      : "Done. Output folder ready.";
    openFolderBtn.disabled = !lastOutputDir;
  } catch (error) {
    output.textContent =
      error && error.message ? error.message : "Extraction failed";
  } finally {
    extractBtn.disabled = false;
    selectFileBtn.disabled = false;
    progress.textContent = "Idle";
  }
});

openFolderBtn.addEventListener("click", async () => {
  if (!lastOutputDir) {
    return;
  }
  await window.keytone.openFolder(lastOutputDir);
});

checkServer();
setInterval(checkServer, 5000);
