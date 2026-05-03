const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("keytone", {
  selectAudioFile: () => ipcRenderer.invoke("select-audio-file"),
  extractLocal: (filePath) => ipcRenderer.invoke("extract-local", filePath),
  openFolder: (targetPath) => ipcRenderer.invoke("open-folder", targetPath),
});
