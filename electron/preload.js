const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronUpdater", {
  onUpdateMessage: (callback) => {
    ipcRenderer.on("update-message", (_event, message) => callback(message));
  },
  restartApp: () => ipcRenderer.send("restart-app")
});