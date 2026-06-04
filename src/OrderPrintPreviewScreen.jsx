import React, { useEffect, useMemo, useState } from "react";

const SAVED_PRINTER_KEY = "nab-admin-dashboard:selected-printer";
const SAVED_PAPER_MODE_KEY = "nab-admin-dashboard:printer-paper-mode";

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function safeText(value, fallback = "-") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSavedPrinterName() {
  try {
    return localStorage.getItem(SAVED_PRINTER_KEY) || "";
  } catch {
    return "";
  }
}

function savePrinterName(printerName) {
  try {
    if (printerName) {
      localStorage.setItem(SAVED_PRINTER_KEY, printerName);
    }
  } catch {
    // Ignore localStorage errors.
  }
}

function getSavedPaperMode() {
  try {
    return localStorage.getItem(SAVED_PAPER_MODE_KEY) || "A4";
  } catch {
    return "A4";
  }
}

function savePaperMode(mode) {
  try {
    localStorage.setItem(SAVED_PAPER_MODE_KEY, mode);
  } catch {
    // Ignore localStorage errors.
  }
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}

function getPrinterStatusInfo(printer) {
  if (!printer) {
    return {
      text: "No printer selected",
      tone: "warning",
      raw: "",
    };
  }

  const status = printer.status;

  if (status === undefined || status === null || status === "") {
    return {
      text: "Status unknown",
      tone: "warning",
      raw: "",
    };
  }

  if (typeof status === "string") {
    const text = titleCase(status);

    const lower = status.toLowerCase();
    const isBad =
      lower.includes("offline") ||
      lower.includes("error") ||
      lower.includes("jam") ||
      lower.includes("paused") ||
      lower.includes("stopped");

    const isWorking =
      lower.includes("print") ||
      lower.includes("process") ||
      lower.includes("busy");

    return {
      text: text || "Status unknown",
      tone: isBad ? "error" : isWorking ? "working" : "ready",
      raw: status,
    };
  }

  const code = Number(status);

  if (!Number.isFinite(code)) {
    return {
      text: "Status unknown",
      tone: "warning",
      raw: String(status),
    };
  }

  if (code === 0) {
    return {
      text: "Ready",
      tone: "ready",
      raw: String(code),
    };
  }

  const flags = [
    [1, "Paused", "error"],
    [2, "Error", "error"],
    [4, "Pending Deletion", "error"],
    [8, "Paper Jam", "error"],
    [16, "Paper Out", "error"],
    [32, "Manual Feed", "warning"],
    [64, "Paper Problem", "error"],
    [128, "Offline", "error"],
    [256, "I/O Active", "working"],
    [512, "Busy", "working"],
    [1024, "Printing", "working"],
    [2048, "Output Bin Full", "error"],
    [4096, "Not Available", "error"],
    [8192, "Waiting", "warning"],
    [16384, "Processing", "working"],
    [32768, "Initializing", "working"],
    [65536, "Warming Up", "working"],
    [131072, "Toner Low", "warning"],
    [262144, "No Toner", "error"],
    [1048576, "User Intervention", "error"],
    [2097152, "Out Of Memory", "error"],
    [4194304, "Door Open", "error"],
    [8388608, "Server Unknown", "warning"],
    [16777216, "Power Save", "ready"],
  ];

  const matched = flags.filter(([flag]) => (code & flag) === flag);

  if (matched.length === 0) {
    return {
      text: `Status ${code}`,
      tone: "warning",
      raw: String(code),
    };
  }

  const hasError = matched.some(([, , tone]) => tone === "error");
  const hasWorking = matched.some(([, , tone]) => tone === "working");

  return {
    text: matched.map(([, label]) => label).join(", "),
    tone: hasError ? "error" : hasWorking ? "working" : "warning",
    raw: String(code),
  };
}

function getStatusDotStyle(tone) {
  const background =
    tone === "ready"
      ? "#16a34a"
      : tone === "working"
      ? "#2563eb"
      : tone === "error"
      ? "#dc2626"
      : "#f59e0b";

  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background,
    boxShadow: `0 0 0 4px ${background}22`,
    flex: "0 0 auto",
  };
}

export default function OrderPrintPreviewScreen({ order, onBack }) {
  const items = Array.isArray(order?.items) ? order.items : [];

  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [copies, setCopies] = useState(1);
  const [paperMode, setPaperMode] = useState(() => getSavedPaperMode());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printMessage, setPrintMessage] = useState("");
  const [printerError, setPrinterError] = useState("");

  const selectedPrinterInfo = useMemo(() => {
    return printers.find((printer) => printer.name === selectedPrinter) || null;
  }, [printers, selectedPrinter]);

  const printerStatus = useMemo(() => {
    return getPrinterStatusInfo(selectedPrinterInfo);
  }, [selectedPrinterInfo]);

  const totalQty = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item?.qty || 0), 0);
  }, [items]);

  const totalValue = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item?.qty || 0);
      const price = Number(
        item?.retailPrice ?? item?.price ?? item?.netPrice ?? 0
      );
      return sum + qty * price;
    }, 0);
  }, [items]);

  useEffect(() => {
    let mounted = true;

    async function loadPrinters() {
      try {
        setPrinterError("");

        if (!window.electronPrint?.getPrinters) {
          setPrinterError(
            "Printer API not loaded. Restart the Electron desktop app."
          );
          return;
        }

        const printerList = await window.electronPrint.getPrinters();

        if (!mounted) return;

        const safePrinterList = Array.isArray(printerList) ? printerList : [];
        const savedPrinterName = getSavedPrinterName();

        setPrinters(safePrinterList);

        const savedPrinter = safePrinterList.find(
          (printer) => printer.name === savedPrinterName
        );

        const defaultPrinter = safePrinterList.find(
          (printer) => printer.isDefault
        );

        const nextPrinterName =
          savedPrinter?.name ||
          defaultPrinter?.name ||
          safePrinterList[0]?.name ||
          "";

        setSelectedPrinter(nextPrinterName);

        if (nextPrinterName) {
          savePrinterName(nextPrinterName);
        }

        if (safePrinterList.length === 0) {
          setPrinterError("No printers found on this computer.");
          return;
        }

        if (savedPrinterName && !savedPrinter) {
          setPrintMessage(
            "Saved printer was not found. I have selected another printer."
          );
        }
      } catch (error) {
        if (!mounted) return;
        setPrinterError(error?.message || "Failed to load printers.");
      }
    }

    loadPrinters();

    return () => {
      mounted = false;
    };
  }, []);

  function handlePrinterChange(event) {
    const nextPrinterName = event.target.value;

    setSelectedPrinter(nextPrinterName);
    savePrinterName(nextPrinterName);
    setPrintMessage("Printer saved for next time ✅");
    setPrinterError("");
  }

  function handlePaperModeChange(event) {
    const nextMode = event.target.value;

    setPaperMode(nextMode);
    savePaperMode(nextMode);
  }

  function buildPrintHtml(paperHtml) {
    const styles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map((node) => node.outerHTML)
      .join("\n");

    const baseHref = escapeHtml(document.baseURI || window.location.href);

    const pageSizeCss =
      paperMode === "printer-default"
        ? ""
        : `
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <base href="${baseHref}" />
          ${styles}
          <style>
            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: #ffffff !important;
              color: #020617;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system,
                BlinkMacSystemFont, Segoe UI, Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            ${pageSizeCss}

            .no-print,
            .print-toolbar,
            .printer-panel,
            .print-message {
              display: none !important;
            }

            #printPaper,
            .print-page {
              width: 100% !important;
              max-width: none !important;
              min-height: auto !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: 0 !important;
              border-radius: 0 !important;
              background: #ffffff !important;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: auto;
            }

            thead {
              display: table-header-group;
            }

            tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
          </style>
        </head>
        <body>
          ${paperHtml}
        </body>
      </html>
    `;
  }

  async function refreshPrinters() {
    try {
      setPrinterError("");
      setPrintMessage("Refreshing printers...");

      if (!window.electronPrint?.getPrinters) {
        setPrinterError("Printer API not loaded. Restart the app.");
        setPrintMessage("");
        return;
      }

      const printerList = await window.electronPrint.getPrinters();
      const safePrinterList = Array.isArray(printerList) ? printerList : [];

      setPrinters(safePrinterList);

      const savedPrinterName = getSavedPrinterName();

      const savedPrinter = safePrinterList.find(
        (printer) => printer.name === savedPrinterName
      );

      const currentPrinter = safePrinterList.find(
        (printer) => printer.name === selectedPrinter
      );

      const defaultPrinter = safePrinterList.find(
        (printer) => printer.isDefault
      );

      const nextPrinterName =
        savedPrinter?.name ||
        currentPrinter?.name ||
        defaultPrinter?.name ||
        safePrinterList[0]?.name ||
        "";

      setSelectedPrinter(nextPrinterName);

      if (nextPrinterName) {
        savePrinterName(nextPrinterName);
      }

      setPrintMessage("Printers refreshed ✅");

      if (safePrinterList.length === 0) {
        setPrinterError("No printers found on this computer.");
        setPrintMessage("");
      }
    } catch (error) {
      setPrinterError(error?.message || "Failed to refresh printers.");
      setPrintMessage("");
    }
  }

  async function handlePrint() {
    try {
      const paper = document.getElementById("printPaper");

      if (!paper) {
        setPrintMessage("Print area not found.");
        return;
      }

      if (!window.electronPrint?.printHtml) {
        setPrintMessage("Electron print API not loaded. Restart the app.");
        return;
      }

      if (!selectedPrinter) {
        setPrintMessage("Please pick a printer first.");
        return;
      }

      setIsPrinting(true);
      setPrintMessage("Sending to printer...");

      savePrinterName(selectedPrinter);

      const html = buildPrintHtml(paper.outerHTML);

      const result = await window.electronPrint.printHtml({
        html,
        deviceName: selectedPrinter,
        copies,
        landscape: false,
        color: true,
        pageSize: "A4",
        usePrinterDefaultPageSize: paperMode === "printer-default",
      });

      if (!result?.ok) {
        setPrintMessage(`Print failed: ${result?.message || "Unknown error"}`);
        return;
      }

      setPrintMessage("Sent to printer ✅");
    } catch (error) {
      setPrintMessage(`Print failed: ${error?.message || "Unknown error"}`);
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <div style={pageStyle}>
      <style>
        {`
          @media print {
            body {
              background: white !important;
            }

            .no-print,
            .print-toolbar,
            .printer-panel,
            .print-message {
              display: none !important;
            }

            .print-page {
              box-shadow: none !important;
              border: none !important;
              margin: 0 !important;
              width: 100% !important;
              min-height: auto !important;
            }

            @page {
              size: A4 portrait;
              margin: 8mm;
            }
          }
        `}
      </style>

      <div className="print-toolbar no-print" style={toolbarStyle}>
        <button onClick={onBack} style={secondaryButtonStyle}>
          ← Back to Order
        </button>

        <div>
          <p style={toolbarEyebrowStyle}>Printer Preview</p>
          <h1 style={toolbarTitleStyle}>Order {safeText(order?.orderRef)}</h1>
        </div>

        <div className="printer-panel" style={printerPanelStyle}>
          <select
            value={selectedPrinter}
            onChange={handlePrinterChange}
            style={printerSelectStyle}
            title="Choose printer"
          >
            {printers.length === 0 ? (
              <option value="">No printers found</option>
            ) : (
              printers.map((printer) => {
                const statusInfo = getPrinterStatusInfo(printer);

                return (
                  <option key={printer.name} value={printer.name}>
                    {printer.displayName || printer.name}
                    {printer.isDefault ? " — Default" : ""}
                    {statusInfo.text ? ` — ${statusInfo.text}` : ""}
                  </option>
                );
              })
            )}
          </select>

          <div style={statusBoxStyle}>
            <span style={getStatusDotStyle(printerStatus.tone)} />
            <div style={statusTextWrapStyle}>
              <span style={statusLabelStyle}>Printer Status</span>
              <strong style={statusValueStyle}>{printerStatus.text}</strong>
            </div>
          </div>

          <input
            type="number"
            min="1"
            value={copies}
            onChange={(event) => {
              const next = Number(event.target.value);
              setCopies(Number.isFinite(next) && next > 0 ? next : 1);
            }}
            style={copiesInputStyle}
            title="Copies"
          />

          <select
            value={paperMode}
            onChange={handlePaperModeChange}
            style={paperSelectStyle}
            title="Paper size"
          >
            <option value="A4">A4</option>
            <option value="printer-default">Printer Default</option>
          </select>

          <button
            type="button"
            onClick={refreshPrinters}
            style={refreshButtonStyle}
            disabled={isPrinting}
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              ...primaryButtonStyle,
              opacity: isPrinting ? 0.65 : 1,
              cursor: isPrinting ? "not-allowed" : "pointer",
            }}
            disabled={isPrinting}
          >
            {isPrinting ? "Printing..." : "Print"}
          </button>
        </div>
      </div>

      {(printMessage || printerError) && (
        <div className="print-message no-print" style={messageBoxStyle}>
          {printerError ? (
            <strong style={errorTextStyle}>{printerError}</strong>
          ) : (
            <strong>{printMessage}</strong>
          )}
        </div>
      )}

      <main id="printPaper" className="print-page" style={printPageStyle}>
        <header style={printHeaderStyle}>
          <div>
            <div style={logoStyle}>NAB</div>
            <h1 style={printTitleStyle}>Parts Request</h1>
            <p style={mutedTextStyle}>NAB Admin Dashboard</p>
          </div>

          <div style={orderRefBoxStyle}>
            <span style={smallLabelStyle}>Order Ref</span>
            <strong style={orderRefStyle}>{safeText(order?.orderRef)}</strong>

            <span style={smallLabelStyle}>Created</span>
            <strong style={smallValueStyle}>
              {formatDateTime(order?.createdAt)}
            </strong>
          </div>
        </header>

        <section style={infoGridStyle}>
          <InfoBox label="Customer" value={order?.customer} />
          <InfoBox label="User" value={order?.user} />
          <InfoBox label="Fleet" value={order?.fleet} />
          <InfoBox label="Status" value={order?.status} />
          <InfoBox label="Delivery Status" value={order?.deliveryStatus} />
          <InfoBox label="Product Status" value={order?.productStatus} />
        </section>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <span style={smallLabelStyle}>Items</span>
              <h2 style={sectionTitleStyle}>Order Lines</h2>
            </div>

            <div style={summaryPillsStyle}>
              <span style={summaryPillStyle}>Qty: {totalQty}</span>
              <span style={summaryPillStyle}>
                Total: {formatCurrency(totalValue)}
              </span>
            </div>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>SKU</th>
                <th style={thRightStyle}>Qty</th>
                <th style={thRightStyle}>Net</th>
                <th style={thRightStyle}>Retail</th>
                <th style={thRightStyle}>Line Total</th>
                <th style={thRightStyle}>Stock</th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={7}>
                    No items on this order.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const qty = Number(item?.qty || 0);
                  const retail = Number(item?.retailPrice ?? item?.price ?? 0);
                  const lineTotal = qty * retail;

                  return (
                    <tr key={item?.id || index}>
                      <td style={tdStyle}>
                        <strong>{safeText(item?.name, "Unnamed Item")}</strong>
                      </td>

                      <td style={tdStyle}>{safeText(item?.sku)}</td>

                      <td style={tdRightStyle}>{qty}</td>

                      <td style={tdRightStyle}>
                        {formatCurrency(item?.netPrice)}
                      </td>

                      <td style={tdRightStyle}>{formatCurrency(retail)}</td>

                      <td style={tdRightStyle}>
                        {formatCurrency(lineTotal)}
                      </td>

                      <td style={tdRightStyle}>
                        {safeText(item?.stockBefore, "0")} →{" "}
                        {safeText(item?.stockAfter, "0")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section style={notesSectionStyle}>
          <span style={smallLabelStyle}>Notes</span>
          <p style={notesTextStyle}>
            {safeText(order?.notes, "No notes added.")}
          </p>
        </section>

        <footer style={footerStyle}>
          <span>Generated by NAB Admin Dashboard</span>
          <span>{new Date().toLocaleString("en-GB")}</span>
        </footer>
      </main>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div style={infoBoxStyle}>
      <span style={smallLabelStyle}>{label}</span>
      <strong style={smallValueStyle}>{safeText(value)}</strong>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f6f8",
  padding: 18,
  boxSizing: "border-box",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial",
};

const toolbarStyle = {
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 18,
  padding: 16,
  marginBottom: 18,
  display: "grid",
  gridTemplateColumns: "auto minmax(230px, 1fr) minmax(520px, auto)",
  gap: 16,
  alignItems: "center",
  boxShadow: "0 16px 45px rgba(15,23,42,0.06)",
};

const toolbarEyebrowStyle = {
  margin: 0,
  color: "#2563eb",
  fontSize: 12,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.9,
};

const toolbarTitleStyle = {
  margin: "4px 0 0",
  color: "#111827",
  fontSize: 24,
};

const printerPanelStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const printerSelectStyle = {
  height: 46,
  minWidth: 250,
  maxWidth: 360,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#111827",
  borderRadius: 12,
  padding: "0 12px",
  fontWeight: 850,
  outline: "none",
};

const statusBoxStyle = {
  minHeight: 46,
  minWidth: 165,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: 12,
  padding: "7px 10px",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const statusTextWrapStyle = {
  display: "grid",
  gap: 1,
  minWidth: 0,
};

const statusLabelStyle = {
  fontSize: 9,
  color: "#64748b",
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const statusValueStyle = {
  fontSize: 12,
  color: "#111827",
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 170,
};

const paperSelectStyle = {
  height: 46,
  minWidth: 125,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#111827",
  borderRadius: 12,
  padding: "0 12px",
  fontWeight: 850,
  outline: "none",
};

const copiesInputStyle = {
  height: 46,
  width: 72,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#111827",
  borderRadius: 12,
  padding: "0 12px",
  fontWeight: 850,
  outline: "none",
};

const primaryButtonStyle = {
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  borderRadius: 14,
  padding: "13px 18px",
  fontWeight: 950,
  cursor: "pointer",
};

const refreshButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "#ffffff",
  color: "#111827",
  borderRadius: 14,
  padding: "13px 14px",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "1px solid #dbe3ef",
  background: "white",
  color: "#111827",
  borderRadius: 14,
  padding: "13px 18px",
  fontWeight: 950,
  cursor: "pointer",
};

const messageBoxStyle = {
  width: "min(980px, 100%)",
  margin: "0 auto 18px",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 14,
  padding: "12px 16px",
  boxSizing: "border-box",
  fontSize: 13,
};

const errorTextStyle = {
  color: "#b91c1c",
};

const printPageStyle = {
  width: "min(980px, 100%)",
  minHeight: "1120px",
  margin: "0 auto",
  background: "white",
  border: "1px solid #dfe7f2",
  borderRadius: 18,
  padding: 28,
  boxSizing: "border-box",
  boxShadow: "0 24px 70px rgba(15,23,42,0.12)",
};

const printHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  borderBottom: "4px solid #facc15",
  paddingBottom: 18,
  marginBottom: 18,
};

const logoStyle = {
  width: 58,
  height: 58,
  borderRadius: 16,
  background:
    "linear-gradient(135deg, #111827 0%, #2563eb 55%, #facc15 100%)",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
  marginBottom: 12,
};

const printTitleStyle = {
  margin: 0,
  color: "#111827",
  fontSize: 30,
  letterSpacing: -0.7,
};

const mutedTextStyle = {
  margin: "6px 0 0",
  color: "#64748b",
  fontWeight: 750,
};

const orderRefBoxStyle = {
  minWidth: 230,
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  background: "#f8fafc",
  display: "grid",
  gap: 6,
};

const orderRefStyle = {
  color: "#111827",
  fontSize: 20,
};

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 18,
};

const infoBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 5,
};

const smallLabelStyle = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const smallValueStyle = {
  color: "#111827",
  fontSize: 14,
  fontWeight: 850,
};

const sectionStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  overflow: "hidden",
  marginBottom: 18,
};

const sectionHeaderStyle = {
  padding: 14,
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const sectionTitleStyle = {
  margin: "4px 0 0",
  color: "#111827",
  fontSize: 20,
};

const summaryPillsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const summaryPillStyle = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "8px 12px",
  fontWeight: 900,
  fontSize: 12,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#111827",
  color: "white",
  fontWeight: 900,
};

const thRightStyle = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  color: "#111827",
  verticalAlign: "top",
};

const tdRightStyle = {
  ...tdStyle,
  textAlign: "right",
};

const notesSectionStyle = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  marginBottom: 18,
};

const notesTextStyle = {
  margin: "8px 0 0",
  color: "#334155",
  fontWeight: 700,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const footerStyle = {
  borderTop: "1px solid #e5e7eb",
  paddingTop: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 750,
};