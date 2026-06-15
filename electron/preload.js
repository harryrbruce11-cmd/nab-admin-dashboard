
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
});

contextBridge.exposeInMainWorld("electronUpdater", {
  checkForUpdates: () =>
    ipcRenderer.invoke("updater:check-for-updates"),

  quitAndInstall: () =>
    ipcRenderer.invoke("updater:quit-and-install"),

  onUpdateMessage: (callback) => {
    ipcRenderer.removeAllListeners("update-message");

    ipcRenderer.on(
      "update-message",
      (_event, message) => callback(message)
    );
  },
});

contextBridge.exposeInMainWorld(
  "electronPrint",
  {
    getPrinters: () =>
      ipcRenderer.invoke(
        "print:get-printers"
      ),

    printPdf: (data) =>
      ipcRenderer.invoke(
        "print:pdf",
        data
      ),
  }
);

