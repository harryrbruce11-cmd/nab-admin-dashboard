const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;

function sendUpdateMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-message", message);
  }
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

  mainWindow.on("closed", () => {
    mainWindow = null;
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

async function waitForPrintAssets(printWindow) {
  await printWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        setTimeout(resolve, 250);
      };

      const waitForFonts =
        document.fonts && document.fonts.ready
          ? document.fonts.ready.catch(() => null)
          : Promise.resolve();

      const images = Array.from(document.images || []);

      const waitForImages = Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();

          return new Promise((res) => {
            const done = () => res();

            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });

            setTimeout(done, 5000);
          });
        })
      );

      Promise.all([waitForFonts, waitForImages])
        .then(finish)
        .catch(finish);

      setTimeout(finish, 8000);
    });
  `);
}

ipcMain.handle("print:get-printers", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  if (!win || win.isDestroyed()) {
    return [];
  }

  const printers = await win.webContents.getPrintersAsync();

  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean(printer.isDefault),
    status: printer.status,
    description: printer.description || "",
  }));
});

ipcMain.handle("print:html", async (event, payload = {}) => {
  const parent = BrowserWindow.fromWebContents(event.sender);

  const html = typeof payload.html === "string" ? payload.html : "";
  const deviceName = String(payload.deviceName || "").trim();

  const copiesNumber = Number(payload.copies);
  const copies =
    Number.isFinite(copiesNumber) && copiesNumber > 0
      ? Math.floor(copiesNumber)
      : 1;

  if (!html.trim()) {
    return {
      ok: false,
      message: "No print HTML received.",
    };
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );

    await waitForPrintAssets(printWindow);

    const printOptions = {
      silent: true,
      printBackground: true,
      color: payload.color !== false,
      copies,
      landscape: Boolean(payload.landscape),
      margins: {
        marginType: "printableArea",
      },
    };

    if (deviceName) {
      printOptions.deviceName = deviceName;
    }

    if (payload.usePrinterDefaultPageSize === true) {
      printOptions.usePrinterDefaultPageSize = true;
    } else {
      printOptions.pageSize = payload.pageSize || "A4";
    }

    const result = await new Promise((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        resolve({
          ok: success,
          message: success
            ? "Sent to printer."
            : failureReason || "Print failed.",
        });
      });
    });

    return result;
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Print failed.",
    };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
});

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();

  if (!process.env.ELECTRON_START_URL) {
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      sendUpdateMessage(error?.message || "Auto update check failed.");
    });
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
  if (process.env.ELECTRON_START_URL) {
    sendUpdateMessage("Auto updates only run in the built app.");
    return null;
  }

  return autoUpdater.checkForUpdates();
});

ipcMain.handle("updater:quit-and-install", () => {
  autoUpdater.quitAndInstall();
});