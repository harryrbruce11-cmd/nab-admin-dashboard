const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const fetch = require("node-fetch");
const { autoUpdater } = require("electron-updater");
const { print, getPrinters } = require("pdf-to-printer");


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
    icon: path.join(__dirname, "assets", "CellBlockStores_Icon_1024.png"),
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
    mainWindow.loadFile(
      path.join(__dirname, "../dist/index.html")
    );
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

ipcMain.handle("print:get-printers", async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    let electronPrinters = [];
    if (win && !win.isDestroyed()) {
      try { electronPrinters = await win.webContents.getPrintersAsync(); } catch {}
    }
    const nativePrinters = await getPrinters().catch(() => []);
    const combined = new Map();
    electronPrinters.forEach(printer => combined.set(String(printer.name).toLowerCase(), {
      name: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: Boolean(printer.isDefault),
      status: printer.status || "Ready",
      description: printer.description || "",
    }));
    nativePrinters.forEach(printer => {
      const key = String(printer.name || "").toLowerCase();
      if (!key) return;
      const existing = combined.get(key);
      combined.set(key, existing || {
        name: printer.name,
        displayName: printer.name,
        isDefault: Boolean(printer.isDefault || printer.default),
        status: printer.status || "Ready",
        description: "Windows printer",
      });
    });
    return [...combined.values()];
  } catch (error) {
    console.error("Printer list error:", error);
    return [];
  }
});

ipcMain.handle("print:pdf", async (_event, payload = {}) => {
  let tempPdf = "";

  try {
    const pdfUrl = String(payload.pdfUrl || "").trim();
    const pdfBase64 = String(payload.pdfBase64 || "").replace(/^data:application\/pdf(?:;filename=[^;]+)?;base64,/, "");

    const deviceName = String(
      payload.deviceName || payload.printerName || ""
    ).trim();

    if (!pdfUrl && !pdfBase64) {
      return {
        ok: false,
        message: "No PDF URL supplied.",
      };
    }

    if (pdfUrl && !pdfUrl.startsWith("https://")) {
      return {
        ok: false,
        message: "PDF URL must be HTTPS.",
      };
    }

    if (!deviceName) {
      return {
        ok: false,
        message: "No printer selected.",
      };
    }

    console.log("================================");
    console.log("DIRECT PDF PRINT HANDLER");
    console.log("PDF URL:", pdfUrl);
    console.log("Printer:", deviceName);
    console.log("================================");

    let pdfBuffer;
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, "base64");
    } else {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(`Failed to download PDF (${response.status})`);
      pdfBuffer = await response.buffer();
    }

    tempPdf = path.join(os.tmpdir(), `nab-order-${Date.now()}.pdf`);

    fs.writeFileSync(tempPdf, pdfBuffer);

    const windowsPrinters = await getPrinters();

    console.log(
      "Available Windows Printers:",
      windowsPrinters.map((p) => p.name)
    );

    const matchedPrinter =
      windowsPrinters.find((p) => p.name === deviceName) ||
      windowsPrinters.find(
        (p) =>
          String(p.name || "").toLowerCase() === deviceName.toLowerCase()
      ) ||
      windowsPrinters.find((p) =>
        String(p.name || "")
          .toLowerCase()
          .includes(deviceName.toLowerCase())
      );

    if (!matchedPrinter) {
      return {
        ok: false,
        message: `Printer not found: ${deviceName}`,
      };
    }

    await print(tempPdf, {
      printer: matchedPrinter.name,
      copies: 1,
    });

    console.log("PDF sent to Windows printer:", matchedPrinter.name);

    return {
      ok: true,
      message: "PDF sent to printer.",
    };
  } catch (error) {
    console.error("DIRECT PDF PRINT ERROR:", error);

    return {
      ok: false,
      message: error?.message || "PDF print failed.",
    };
  } finally {
    if (tempPdf) {
      setTimeout(() => {
        try {
          if (fs.existsSync(tempPdf)) {
            fs.unlinkSync(tempPdf);
          }
        } catch {}
      }, 10000);
    }
  }
});

ipcMain.handle("pdf:save", async (event, payload = {}) => {
  try {
    const pdfBase64 = String(payload.pdfBase64 || "").replace(/^data:application\/pdf(?:;filename=[^;]+)?;base64,/, "");
    if (!pdfBase64) return { ok: false, message: "No PDF data supplied." };
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: "Save PDF report",
      defaultPath: String(payload.fileName || "vehicle-check-report.pdf"),
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(pdfBase64, "base64"));
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    return { ok: false, message: error?.message || "Could not save PDF." };
  }
});

ipcMain.handle("print:generated-pdf", async (_event, payload = {}) => {
  let tempPdf = "";
  try {
    const pdfBase64 = String(payload.pdfBase64 || "").replace(/^data:application\/pdf(?:;filename=[^;]+)?;base64,/, "");
    const deviceName = String(payload.deviceName || "").trim();
    if (!pdfBase64) return { ok: false, message: "The generated PDF is empty." };
    tempPdf = path.join(os.tmpdir(), `nab-vehicle-report-${Date.now()}.pdf`);
    fs.writeFileSync(tempPdf, Buffer.from(pdfBase64, "base64"));
    const windowsPrinters = await getPrinters();
    const matchedPrinter = deviceName
      ? windowsPrinters.find(item => item.name === deviceName) || windowsPrinters.find(item => String(item.name || "").toLowerCase() === deviceName.toLowerCase())
      : null;
    if (deviceName && !matchedPrinter) return { ok: false, message: `Printer not found: ${deviceName}` };

    await print(tempPdf, matchedPrinter ? { printer: matchedPrinter.name, copies: 1 } : { copies: 1 });
    return { ok: true, message: "PDF report sent to printer." };
  } catch (error) {
    return { ok: false, message: error?.message || "Generated PDF print failed." };
  } finally {
    if (tempPdf) setTimeout(() => {
      try { if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf); } catch {}
    }, 10000);
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
