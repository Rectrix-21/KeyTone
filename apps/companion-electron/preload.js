const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("keytone", {
  selectAudioFile: () => ipcRenderer.invoke("select-audio-file"),
  selectOutputFolder: () => ipcRenderer.invoke("select-output-folder"),
  getLogoPath: () => ipcRenderer.invoke("get-logo-path"),
  onExtractProgress: (callback) => {
    ipcRenderer.removeAllListeners("extract-progress");
    ipcRenderer.on("extract-progress", (_event, payload) => callback(payload));
  },
  extractLocal: (filePath, selectedStems, outputDirPath) =>
    ipcRenderer.invoke("extract-local", filePath, selectedStems, outputDirPath),
  openFolder: (targetPath) => ipcRenderer.invoke("open-folder", targetPath),
  getEngineStatus: () => ipcRenderer.invoke("engine-status"),
  installEngine: () => ipcRenderer.invoke("engine-install"),
});
