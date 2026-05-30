const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow;

function sendUpdateMessage(message) {
  mainWindow?.webContents.send("update-message", message);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "NAB Admin Dashboard",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_START_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
autoUpdater.setFeedURL({
  provider: "generic",
  url: "https://nabadminapp.web.app/updates",
});

  autoUpdater.on("checking-for-update", () => {
    sendUpdateMessage("Checking Firebase for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateMessage(
      `Update available${info?.version ? `: v${info.version}` : ""}. Downloading now...`
    );
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress?.percent || 0);
    sendUpdateMessage(`Downloading update... ${percent}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateMessage(
      `Update ready${info?.version ? `: v${info.version}` : ""}. Install now.`
    );
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateMessage("You already have the latest version.");
  });

  autoUpdater.on("error", (error) => {
    sendUpdateMessage(error?.message || "Auto update failed.");
  });
}

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();

  if (!process.env.ELECTRON_START_URL) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("updater:check-for-updates", async () => {
  return autoUpdater.checkForUpdates();
});

ipcMain.handle("updater:quit-and-install", () => {
  autoUpdater.quitAndInstall();
});