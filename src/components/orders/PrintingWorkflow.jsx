import React, { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";

export default function PrintingWorkflow({ order, db }) {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printerStatus, setPrinterStatus] = useState("Ready");
  const [printing, setPrinting] = useState(false);

  // Load local printers if Electron is available
  useEffect(() => {
    async function loadPrinters() {
      try {
        if (window.electronAPI?.getPrinters) {
          const list = await window.electronAPI.getPrinters();
          setPrinters(list || []);
          if (list && list.length > 0) {
            setSelectedPrinter(list[0].name || list[0]);
          }
        }
      } catch {
        setPrinters([]);
      }
    }

    loadPrinters();
  }, []);

  async function markCompleted() {
    if (!db || !order?.id) return;

    await updateDoc(doc(db, "orders", order.id), {
      status: "Completed",
      processingStatus: "Completed",
      productStatus: "Completed",
      selectedPrinter: selectedPrinter || "",
      printedAt: new Date(),
    });
  }

  async function handlePrint() {
    if (!order?.pdfUrl) return;

    setPrinting(true);
    setPrinterStatus("Printing...");

    try {
      // If running inside Electron, use native printing
      if (window.electronAPI?.printPDF) {
        const result = await window.electronAPI.printPDF({
          url: order.pdfUrl,
          printerName: selectedPrinter,
        });

        if (result?.success) {
          await markCompleted();
          setPrinterStatus("Printed Successfully");
        } else {
          setPrinterStatus("Print Failed");
        }
      } else {
        // Fallback (browser dev mode)
        const win = window.open(order.pdfUrl, "_blank");

        if (win) {
          const checkClosed = setInterval(async () => {
            if (win.closed) {
              clearInterval(checkClosed);
              await markCompleted();
              setPrinterStatus("Printed Successfully");
              setPrinting(false);
            }
          }, 500);
        }
      }
    } catch {
      setPrinterStatus("Print Failed");
    } finally {
      if (!(window.electronAPI?.printPDF)) {
        // Do not set printing to false here because it's handled in the interval
      } else {
        setPrinting(false);
      }
    }
  }

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Printing</h3>

      <div style={styles.row}>
        <strong>Status</strong>
        <span
          style={{
            ...styles.status,
            color:
              printerStatus === "Printed Successfully"
                ? "#22c55e"
                : printerStatus === "Print Failed"
                ? "#ef4444"
                : "#facc15",
          }}
        >
          {printerStatus}
        </span>
      </div>

      {printers.length > 0 && (
        <div style={styles.row}>
          <strong>Printer</strong>
          <select
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            style={styles.select}
          >
            {printers.map((printer, i) => (
              <option key={i} value={printer.name || printer}>
                {printer.name || printer}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        style={styles.printButton}
        onClick={handlePrint}
        disabled={!order?.pdfUrl || printing}
      >
        {printing ? "Printing..." : "Print Order"}
      </button>

      <div style={styles.helperBox}>
        <strong>Printing Instructions:</strong>
        <div style={{ marginTop: 6 }}>
          1. Press <b>Print Order</b>.
        </div>
        <div>
          2. Select your local printer.
        </div>
        <div>
          3. After printing, close the PDF window.
        </div>
        <div>
          The order will automatically update to <b>Completed</b> once the print window closes.
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "#0f172a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  title: {
    marginTop: 0,
    marginBottom: 16,
    color: "#facc15",
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },

  status: {
    fontWeight: 800,
  },

  select: {
    background: "#1e293b",
    color: "white",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: "8px 12px",
  },

  printButton: {
    width: "100%",
    background: "#facc15",
    color: "#111827",
    border: 0,
    borderRadius: 12,
    padding: "12px 16px",
    fontWeight: 900,
    cursor: "pointer",
  },

  helperBox: {
    marginTop: 16,
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
};