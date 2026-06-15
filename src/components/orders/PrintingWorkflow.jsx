import React, { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";

export default function PrintingWorkflow({ order, db }) {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [selectedPrinterLabel, setSelectedPrinterLabel] = useState("Loading...");
  const [printerDeviceStatus, setPrinterDeviceStatus] = useState("Unknown");

  const [printerStatus, setPrinterStatus] = useState("Ready");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    async function loadPrinters() {
      try {
        if (!window.electronPrint?.getPrinters) {
          setPrinters([]);
          setSelectedPrinterLabel("Printer API Missing");
          setPrinterDeviceStatus("Offline");
          return;
        }

        const list = await window.electronPrint.getPrinters();
        setPrinters(list || []);

        const savedPrinter = localStorage.getItem("nab_selected_printer");

        const pickedPrinter =
          list.find((p) => p.name === savedPrinter) ||
          list.find((p) => p.isDefault) ||
          list[0];

        if (!pickedPrinter) {
          setSelectedPrinterName("");
          setSelectedPrinterLabel("No Printer Found");
          setPrinterDeviceStatus("Offline");
          return;
        }

        setSelectedPrinterName(pickedPrinter.name);
        setSelectedPrinterLabel(pickedPrinter.displayName || pickedPrinter.name);
        setPrinterDeviceStatus(pickedPrinter.status || "Ready");
      } catch (error) {
        console.error("Printer load error:", error);
        setPrinters([]);
        setSelectedPrinterName("");
        setSelectedPrinterLabel("No Printer Found");
        setPrinterDeviceStatus("Offline");
      }
    }

    loadPrinters();
  }, []);

  function handlePrinterChange(value) {
    const pickedPrinter = printers.find((p) => p.name === value);

    setSelectedPrinterName(value);
    setSelectedPrinterLabel(pickedPrinter?.displayName || pickedPrinter?.name || value);
    setPrinterDeviceStatus(pickedPrinter?.status || "Ready");

    localStorage.setItem("nab_selected_printer", value);
  }

  async function markCompleted() {
    if (!db || !order?.id) return;

    await updateDoc(doc(db, "orders", order.id), {
      status: "Completed",
      processingStatus: "Completed",
      productStatus: "Completed",
      printedAt: new Date(),
      selectedPrinter: selectedPrinterLabel,
      selectedPrinterDeviceName: selectedPrinterName,
    });
  }

  async function handlePrint() {
    if (!order?.pdfUrl) {
      setPrinterStatus("No PDF Found");
      return;
    }

    if (!window.electronPrint?.printPdf) {
      setPrinterStatus("Print Service Missing");
      return;
    }

    if (!selectedPrinterName) {
      setPrinterStatus("Pick a printer first");
      return;
    }

    setPrinting(true);

    try {
      const pdfUrl = String(order.pdfUrl || "").trim();

      console.log("Original PDF URL:", pdfUrl);
      console.log("Selected printer device name:", selectedPrinterName);

      if (pdfUrl.startsWith("gs://")) {
        throw new Error("PDF is a gs:// link. Save the Firebase HTTPS download URL.");
      }

      if (!pdfUrl.startsWith("https://")) {
        throw new Error("Invalid PDF URL. It must start with https://");
      }

      setPrinterStatus("Checking PDF...");

      const response = await fetch(pdfUrl);

      if (!response.ok) {
        throw new Error(`Unable to download PDF (${response.status})`);
      }

      setPrinterStatus("Sending to Printer...");

      const result = await window.electronPrint.printPdf({
        pdfUrl,
        deviceName: selectedPrinterName,
      });

      console.log("Print Result:", result);

      if (!result?.ok) {
        throw new Error(result?.message || "Print Failed");
      }

      await markCompleted();

      setPrinterStatus("Printed Successfully");

      setTimeout(() => {
        setPrinterStatus("Ready");
      }, 5000);
    } catch (error) {
      console.error("Print error:", error);
      setPrinterStatus(error?.message || "Print Failed");
    } finally {
      setPrinting(false);
    }
  }

  const badgeColor =
    printerStatus === "Printed Successfully"
      ? "#22c55e"
      : printerStatus.includes("Failed") ||
        printerStatus.includes("Missing") ||
        printerStatus.includes("Invalid") ||
        printerStatus.includes("No ") ||
        printerStatus.includes("Pick")
      ? "#ef4444"
      : printerStatus === "Ready"
      ? "#38bdf8"
      : "#facc15";

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.label}>NAB ADMIN DASHBOARD</div>
          <h3 style={styles.title}>Order Printing</h3>
        </div>

        <div style={{ ...styles.badge, background: badgeColor }}>
          {printerStatus}
        </div>
      </div>

      <div style={styles.infoBox}>
        <div style={styles.row}>
          <span>Order Ref</span>
          <strong>{order?.orderRef || "-"}</strong>
        </div>

        <div style={styles.row}>
          <span>Customer</span>
          <strong>{order?.customer || "-"}</strong>
        </div>

        <div style={styles.row}>
          <span>User</span>
          <strong>{order?.user || "-"}</strong>
        </div>

        <div style={styles.row}>
          <span>Status</span>
          <strong>{order?.status || "-"}</strong>
        </div>

        <div style={styles.row}>
          <span>Printer</span>

          <select
            value={selectedPrinterName}
            onChange={(e) => handlePrinterChange(e.target.value)}
            style={styles.select}
            disabled={printing || printers.length === 0}
          >
            {printers.length === 0 ? (
              <option value="">No printer found</option>
            ) : (
              printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName || printer.name}
                  {printer.isDefault ? " - Default" : ""}
                </option>
              ))
            )}
          </select>
        </div>

        <div style={styles.row}>
          <span>Printer Device Name</span>
          <strong>{selectedPrinterName || "-"}</strong>
        </div>

        <div style={styles.row}>
          <span>Printer Status</span>
          <strong>{printerDeviceStatus}</strong>
        </div>

        <div style={styles.urlRow}>
          <span>PDF URL</span>
          <strong>{order?.pdfUrl ? "Ready" : "Missing"}</strong>
        </div>
      </div>

      <button
        onClick={handlePrint}
        disabled={printing || !order?.pdfUrl || !selectedPrinterName}
        style={{
          ...styles.button,
          opacity: printing || !order?.pdfUrl || !selectedPrinterName ? 0.7 : 1,
        }}
      >
        {printing ? "Printing..." : "🖨 Print Order"}
      </button>

      <div style={styles.footer}>
        Printing updates the order automatically when successful.
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "#0f172a",
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },

  label: {
    color: "#facc15",
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: 1,
  },

  title: {
    color: "#fff",
    marginTop: 6,
  },

  badge: {
    color: "#111827",
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 900,
    textAlign: "center",
  },

  infoBox: {
    background: "#1e293b",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
    color: "#cbd5e1",
  },

  urlRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    color: "#cbd5e1",
  },

  select: {
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "10px 12px",
    minWidth: 260,
    fontWeight: 800,
  },

  button: {
    width: "100%",
    background: "#facc15",
    color: "#111827",
    border: 0,
    borderRadius: 12,
    padding: 14,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },

  footer: {
    marginTop: 12,
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
  },
};