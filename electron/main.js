const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "NAB Admin Dashboard",
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

app.whenReady().then(() => {
  createWindow();

  if (!process.env.ELECTRON_START_URL) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

autoUpdater.on("update-available", () => {
  mainWindow?.webContents.send("update-message", "Update available. Downloading...");
});

autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update-message", "Update downloaded. Restart to install.");
});

ipcMain.on("restart-app", () => {
  autoUpdater.quitAndInstall();
});