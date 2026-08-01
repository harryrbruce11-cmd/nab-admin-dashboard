import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { jsPDF } from "jspdf";
import PrintingWorkflow from "./PrintingWorkflow";
import "./invoice.css";

const INVOICE_HEADER_LOGO = "https://firebasestorage.googleapis.com/v0/b/harry-bruce-gaming-ltd.appspot.com/o/nab%20long%20logo%20top.png?alt=media&token=0b98c2f1-0f19-4839-a948-7a85d40a357b";
let invoiceLogoPromise;

function loadInvoiceLogo() {
  if (!invoiceLogoPromise) {
    invoiceLogoPromise = fetch(INVOICE_HEADER_LOGO)
      .then(response => {
        if (!response.ok) throw new Error("Could not load invoice logo.");
        return response.blob();
      })
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return invoiceLogoPromise;
}

function dateTime(value) {
  const date = value?.toDate ? value.toDate() : null;
  return date ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function pdfUrlFrom(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.url || value.downloadUrl || value.pdfUrl || value.pdf || "").trim();
  return "";
}

export default function OrderDrawer({ order, db, onClose }) {
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(null);
  const [invoicePdf, setInvoicePdf] = useState(null);
  const [openingInvoice, setOpeningInvoice] = useState(false);
  const [printFile, setPrintFile] = useState(null);
  if (!order) return null;
  const items = Array.isArray(order.items) ? order.items : [];
  const isReturn = `${order.status} ${order.processingStatus}`.toLowerCase().includes("return");
  const status = order.processingStatus || order.status || "To pick";
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
  const pdfFiles = [
    { url: pdfUrlFrom(order.pdfUrl || order.pdf), label: isReturn ? "PARTS REQUEST" : "Order PDF" },
    ...(Array.isArray(order.returnPdfUrls) ? order.returnPdfUrls : []).map(value => ({ url: pdfUrlFrom(value), label: "PARTS RETURNED" })),
  ].filter((file, index, files) => file.url && files.findIndex(item => item.url === file.url) === index);

  async function openInvoicePdf() {
    if (invoicePdf?.pdf) {
      window.open(invoicePdf.pdf.output("bloburl"), "_blank", "noopener,noreferrer");
      return;
    }
    if (!order.invoiceId) {
      setShowInvoice(true);
      return;
    }
    setOpeningInvoice(true);
    try {
      const snapshot = await getDoc(doc(db, "invoices", order.invoiceId));
      if (!snapshot.exists()) throw new Error("The saved invoice could not be found.");
      const saved = snapshot.data();
      const pdf = await buildInvoicePdf({
        invoiceRef: saved.invoiceRef || order.invoiceRef || "Invoice",
        order,
        customer: saved.customer || order.customer || "Customer",
        customerAddress: saved.customerAddress || "",
        machine: saved.machine || null,
        lines: saved.lines || [],
        totals: { subtotal: Number(saved.subtotal || saved.total || 0), total: Number(saved.total || saved.subtotal || 0) },
        notes: saved.notes || "",
      });
      const pdfInfo = { pdf, fileName: `${saved.invoiceRef || order.invoiceRef || "invoice"}.pdf` };
      setInvoicePdf(pdfInfo);
      window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
    } catch (error) {
      window.alert(error?.message || "Could not open the invoice PDF.");
    } finally {
      setOpeningInvoice(false);
    }
  }

  return <div className="ma-drawer-backdrop" onMouseDown={onClose}>
    <aside className="ma-drawer" onMouseDown={event => event.stopPropagation()}>
      <header className="ma-drawer-head">
        <button className="ma-close" onClick={onClose}>Close</button>
        <div><span className="ma-eyebrow">{isReturn ? "Returned order" : "Order details"}</span><h2>{order.orderRef || order.reference || order.id}</h2></div>
      </header>
      <div className="ma-drawer-scroll">
        <section className="ma-detail-card">
          <div className="ma-detail-title"><div><span className="ma-eyebrow">Customer</span><h3>{order.customer || order.fleet || "NAB"}</h3><p>{dateTime(order.createdAt)}</p></div><span className={`ma-status ${isReturn ? "returns" : "completed"}`}>{status}</span></div>
          <div className="ma-detail-grid">
            <div><span>{isReturn ? "Returned by" : "Ordered by"}</span><strong>{order.user || "—"}</strong></div>
            <div><span>Delivery</span><strong>{order.deliveryStatus || order.delivery || order.deliveryOption || order.deliveryMethod || order.deliveryType || "Awaiting collection"}</strong></div>
            <div><span>Reason</span><strong>{order.reason || "—"}</strong></div>
            <div><span>Total</span><strong>{quantity} units</strong></div>
          </div>
          {order.notes && <p className="ma-notes">{order.notes}</p>}
        </section>
        <section className="ma-detail-card">
          <div className="ma-pick-heading"><div><span className="ma-eyebrow">{isReturn ? "Returned parts" : "Pick list"}</span><h3>{items.length} line{items.length === 1 ? "" : "s"}</h3></div><strong>{items.length}/{items.length}</strong></div>
          <div className="ma-parts-list">
            {items.length ? items.map((item, index) => <article key={`${item.sku}-${index}`}>
              <div className="ma-part-image">{item.image || item.imageUrl ? <img src={item.image || item.imageUrl} alt=""/> : <span>◇</span>}</div>
              <div><strong>{item.name || "Unnamed product"}{item.sku ? ` – ${item.sku}` : ""}</strong>{item.description && <p>{item.description}</p>}<em>Quantity: {item.quantity || item.qty || 1}</em></div>
              <span className="ma-item-check">✓</span>
            </article>) : <div className="ma-empty">No parts on this order.</div>}
          </div>
        </section>
        {pdfFiles.length > 0 && <section className="ma-order-pdfs"><span className="ma-eyebrow">PDF documents</span>{pdfFiles.map((file, index) => <button type="button" className="ma-pdf" key={`${file.url}-${index}`} onClick={() => setPrintFile(file)}>▧ {["PARTS REQUEST", "PARTS RETURNED"].includes(file.label) ? file.label : `Open ${file.label}`}<span>›</span></button>)}</section>}
        {!isReturn && <button className="ma-invoice-action" disabled={openingInvoice} onClick={invoiceCreated || order.invoiceId ? openInvoicePdf : () => setShowInvoice(true)}>
          <span>£</span><div><strong>{openingInvoice ? "Opening invoice…" : invoiceCreated || order.invoiceId ? "View invoice PDF" : "Convert order to invoice"}</strong><small>{invoiceCreated || order.invoiceRef || "Create a bill for this customer"}</small></div><b>{invoiceCreated || order.invoiceId ? "↗" : "›"}</b>
        </button>}
        <PrintingWorkflow order={order} db={db}/>
      </div>
      {showInvoice && (
        <InvoiceDialog
          order={order}
          db={db}
          onClose={() => setShowInvoice(false)}
          onCreated={(invoiceRef, pdfInfo) => {
            setInvoiceCreated(invoiceRef);
            setInvoicePdf(pdfInfo);
          }}
        />
      )}
      {printFile && <NativePdfDialog file={printFile} onClose={() => setPrintFile(null)}/>} 
    </aside>
  </div>;
}

function NativePdfDialog({ file, onClose }) {
  const [printers, setPrinters] = useState([]);
  const [printer, setPrinter] = useState("");
  const [status, setStatus] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    window.electronPrint?.getPrinters?.().then(list => {
      const available = list || [];
      setPrinters(available);
      const saved = localStorage.getItem("nab_selected_printer");
      const selected = available.find(item => item.name === saved) || available.find(item => item.isDefault) || available[0];
      setPrinter(selected?.name || "");
    }).catch(() => setStatus("Could not load installed printers."));
  }, []);

  async function printPdf() {
    if (!printer || !window.electronPrint?.printPdf) return;
    setPrinting(true);
    setStatus("Sending PDF to printer…");
    try {
      localStorage.setItem("nab_selected_printer", printer);
      const result = await window.electronPrint.printPdf({ pdfUrl: file.url, deviceName: printer });
      if (!result?.ok) throw new Error(result?.message || "Print failed.");
      setStatus("PDF sent to printer successfully.");
    } catch (error) {
      setStatus(error?.message || "Print failed.");
    } finally {
      setPrinting(false);
    }
  }

  return <div className="ma-native-pdf-backdrop" onMouseDown={onClose}><section className="ma-native-pdf-dialog" onMouseDown={event => event.stopPropagation()}><header><div><span className="ma-eyebrow">PDF document</span><h2>{file.label}</h2></div><button type="button" onClick={onClose}>×</button></header><div className="ma-native-pdf-body"><div className="ma-native-pdf-icon">PDF</div><p>This desktop app prints PDFs directly using an installed printer.</p><label><span>Printer</span><select value={printer} onChange={event => setPrinter(event.target.value)}>{printers.length ? printers.map(item => <option value={item.name} key={item.name}>{item.displayName || item.name}{item.isDefault ? " — Default" : ""}</option>) : <option value="">No printers found</option>}</select></label>{status && <strong className="ma-native-pdf-status">{status}</strong>}</div><footer><a className="ma-secondary" href={file.url} target="_blank" rel="noreferrer">Open PDF</a><a className="ma-secondary" href={file.url} download>Download</a><button type="button" className="ma-primary" disabled={printing || !printer} onClick={printPdf}>{printing ? "Printing…" : "Print PDF"}</button></footer></section></div>;
}

function itemPrice(item) {
  const value = item.unitPrice ?? item.retailPrice ?? item.price ?? item.pricing?.retail ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter(Boolean).join("\n");
  if (typeof value === "object") {
    return [
      value.line1 || value.address1 || value.street,
      value.line2 || value.address2,
      value.city || value.town,
      value.county || value.region,
      value.postcode || value.postalCode,
      value.country,
    ].filter(Boolean).join("\n");
  }
  return "";
}

function customerDocumentId(name) {
  return String(name || "customer")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "customer";
}

function machineDocumentId(serialNumber, type, size, customerName) {
  return [serialNumber, type, size, customerName]
    .filter(Boolean)
    .join("-")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `machine-${Date.now()}`;
}

async function buildInvoicePdf({ invoiceRef, order, customer, customerAddress, machine, lines, totals, notes }) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  const headerLogo = await loadInvoiceLogo();
  if (headerLogo) {
    pdf.addImage(headerLogo, "PNG", margin, 9, 78, 18, undefined, "FAST");
  } else {
    pdf.setTextColor(93, 80, 245);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("NAB PLANT ENGINEERING", margin, y);
  }
  pdf.setTextColor(23, 25, 37);
  pdf.setFontSize(28);
  pdf.text("INVOICE", pageWidth - margin, y + 2, { align: "right" });

  y += 18;
  pdf.setDrawColor(225, 225, 232);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;
  pdf.setFontSize(9);
  pdf.setTextColor(125, 126, 137);
  pdf.text("INVOICE NUMBER", margin, y);
  pdf.text("INVOICE DATE", 82, y);
  pdf.text("ORDER REFERENCE", 138, y);
  pdf.setFontSize(11);
  pdf.setTextColor(23, 25, 37);
  pdf.text(invoiceRef, margin, y + 6);
  pdf.text(new Date().toLocaleDateString("en-GB"), 82, y + 6);
  pdf.text(String(order.orderRef || order.reference || order.id), 138, y + 6);

  y += 13;
  pdf.setFontSize(9);
  pdf.setTextColor(125, 126, 137);
  pdf.text("ORDER REASON", margin, y);
  pdf.text("FLEET NUMBER", 82, y);
  pdf.text("ORDERED BY", 138, y);
  pdf.setFontSize(10);
  pdf.setTextColor(23, 25, 37);
  pdf.text(pdf.splitTextToSize(String(order.reason || "Not provided"), 58)[0], margin, y + 6);
  pdf.text(String(order.fleet || order.fleetNumber || "Not provided"), 82, y + 6);
  pdf.text(String(order.user || order.userName || order.orderedBy || "Not provided"), 138, y + 6);

  y += 22;
  pdf.setFontSize(9);
  pdf.setTextColor(125, 126, 137);
  pdf.text("BILL TO", margin, y);
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(23, 25, 37);
  pdf.text(customer || "Customer", margin, y + 7);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const addressLines = pdf.splitTextToSize(customerAddress || "", 78);
  pdf.text(addressLines, margin, y + 13);

  if (machine) {
    pdf.setFontSize(9);
    pdf.setTextColor(125, 126, 137);
    pdf.text("MACHINE", 112, y);
    pdf.setFontSize(10);
    pdf.setTextColor(23, 25, 37);
    pdf.text(`Size: ${machine.size}`, 112, y + 7);
    pdf.text(`Type: ${machine.type}`, 112, y + 13);
    pdf.text(`S.N.: ${machine.serialNumber}`, 112, y + 19);
  }

  y += Math.max(32, 15 + addressLines.length * 5);
  const drawTableHeader = () => {
    pdf.setFillColor(246, 246, 250);
    pdf.rect(margin, y, pageWidth - margin * 2, 9, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 91, 101);
    pdf.text("ITEM", margin + 3, y + 6);
    pdf.text("QTY", 125, y + 6, { align: "right" });
    pdf.text("UNIT PRICE", 158, y + 6, { align: "right" });
    pdf.text("TOTAL", pageWidth - margin - 3, y + 6, { align: "right" });
    y += 9;
  };
  drawTableHeader();

  lines.forEach(line => {
    if (y > 255) {
      pdf.addPage();
      y = 20;
      drawTableHeader();
    }
    const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(35, 36, 44);
    const itemLabel = [line.name || "Item", line.size ? `Size: ${line.size}` : ""].filter(Boolean).join(" — ");
    pdf.text(pdf.splitTextToSize(itemLabel, 82)[0], margin + 3, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(135, 136, 146);
    if (line.sku) pdf.text(String(line.sku), margin + 3, y + 12);
    pdf.setFontSize(10);
    pdf.setTextColor(35, 36, 44);
    pdf.text(String(line.quantity), 125, y + 8, { align: "right" });
    pdf.text(`£${Number(line.unitPrice).toFixed(2)}`, 158, y + 8, { align: "right" });
    pdf.text(`£${lineTotal.toFixed(2)}`, pageWidth - margin - 3, y + 8, { align: "right" });
    y += 16;
    pdf.setDrawColor(235, 235, 240);
    pdf.line(margin, y, pageWidth - margin, y);
  });

  y += 9;
  const totalsX = 138;
  pdf.setFontSize(10);
  pdf.setTextColor(100, 101, 112);
  pdf.text("Subtotal", totalsX, y);
  pdf.text(`£${totals.subtotal.toFixed(2)}`, pageWidth - margin, y, { align: "right" });
  y += 9;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(23, 25, 37);
  pdf.text("Total", totalsX, y);
  pdf.text(`£${totals.total.toFixed(2)}`, pageWidth - margin, y, { align: "right" });

  if (notes) {
    y += 18;
    pdf.setFontSize(9);
    pdf.setTextColor(125, 126, 137);
    pdf.text("NOTES", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(55, 56, 65);
    pdf.text(pdf.splitTextToSize(notes, pageWidth - margin * 2), margin, y + 6);
  }

  return pdf;
}

function InvoiceDialog({ order, db, onClose, onCreated }) {
  const [customer, setCustomer] = useState(order.customer || order.fleet || "");
  const [customerAddress, setCustomerAddress] = useState(() =>
    formatAddress(
      order.customerAddress ||
      order.billingAddress ||
      order.address ||
      order.customer?.address
    ) || ".."
  );
  const [machineSize, setMachineSize] = useState(
    order.machineSize || order.size || order.machine?.size || ""
  );
  const [machineType, setMachineType] = useState(
    order.machineType || order.type || order.machine?.type || order.fleet || ""
  );
  const [machineSerialNumber, setMachineSerialNumber] = useState(
    order.serialNumber || order.machineSerialNumber || order.machine?.serialNumber || order.machine?.sn || ""
  );
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generatedPdf, setGeneratedPdf] = useState(null);
  const [lines, setLines] = useState(() => (order.items || []).map((item, index) => ({
    id: item.id || item.sku || String(index),
    productId: item.productId || item.id || "",
    name: item.name || "Unnamed product",
    sku: item.sku || "",
    size: item.size || item.productSize || item.variant || "",
    description: item.description || "",
    quantity: Number(item.quantity || item.qty || 1),
    unitPrice: itemPrice(item),
  })));

  useEffect(() => {
    let cancelled = false;

    async function loadRetailPrices() {
      const resolved = await Promise.all(lines.map(async line => {
        if (Number(line.unitPrice) > 0) return line;

        try {
          let product = null;

          if (line.productId) {
            const productSnapshot = await getDoc(doc(db, "products", line.productId));
            if (productSnapshot.exists()) product = productSnapshot.data();
          }

          if (!product && line.sku) {
            const productQuery = query(
              collection(db, "products"),
              where("sku", "==", line.sku),
              limit(1)
            );
            const productSnapshot = await getDocs(productQuery);
            if (!productSnapshot.empty) product = productSnapshot.docs[0].data();
          }

          const retailPrice = itemPrice(product || {});
          return retailPrice > 0 ? { ...line, unitPrice: retailPrice } : line;
        } catch {
          return line;
        }
      }));

      if (!cancelled) {
        setLines(current => resolved.map((line, index) =>
          Number(current[index]?.unitPrice) > 0 ? current[index] : line
        ));
      }
    }

    if (db && lines.some(line => Number(line.unitPrice) <= 0)) loadRetailPrices();
    return () => { cancelled = true; };
    // Prices are loaded once when the invoice opens; manual edits are preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomerAddress() {
      const embeddedAddress = formatAddress(
        order.customerAddress ||
        order.billingAddress ||
        order.address ||
        order.customer?.address
      );
      if (embeddedAddress) {
        setCustomerAddress(embeddedAddress);
        return;
      }

      const customerName = String(customer || "").trim();
      if (!db || !customerName) {
        setCustomerAddress("..");
        return;
      }

      try {
        const fields = ["name", "customerName", "companyName"];
        let address = "";
        for (const field of fields) {
          const result = await getDocs(query(
            collection(db, "customers"),
            where(field, "==", customerName),
            limit(1)
          ));
          if (!result.empty) {
            const data = result.docs[0].data();
            address = formatAddress(data.billingAddress || data.address || data.customerAddress);
            if (address) break;
          }
        }
        if (!cancelled) setCustomerAddress(address || "..");
      } catch {
        if (!cancelled) setCustomerAddress("..");
      }
    }

    loadCustomerAddress();
    return () => { cancelled = true; };
  }, [customer, db, order]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedMachine() {
      if (!db || !customer.trim() || (machineSize && machineType && machineSerialNumber)) return;
      try {
        const result = await getDocs(query(
          collection(db, "machines"),
          where("customerName", "==", customer.trim()),
          limit(1)
        ));
        if (!cancelled && !result.empty) {
          const machine = result.docs[0].data();
          if (!machineSize) setMachineSize(String(machine.size || ""));
          if (!machineType) setMachineType(String(machine.type || ""));
          if (!machineSerialNumber) setMachineSerialNumber(String(machine.serialNumber || machine.sn || ""));
        }
      } catch {
        // Machine details remain optional when no saved record is available.
      }
    }

    loadSavedMachine();
    return () => { cancelled = true; };
  }, [customer, db, machineSerialNumber, machineSize, machineType]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
    return { subtotal, total: subtotal };
  }, [lines]);

  function updateLine(index, field, value) {
    setLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }

  async function createInvoice(event) {
    event.preventDefault();
    if (!db || !order.id) return;
    setSaving(true);
    setError("");
    try {
      const invoiceRef = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-6)}`;
      const cleanCustomerAddress = customerAddress.trim() || "..";

      if (customer.trim() && cleanCustomerAddress !== "..") {
        await setDoc(
          doc(db, "customers", customerDocumentId(customer)),
          {
            name: customer.trim(),
            customerName: customer.trim(),
            companyName: customer.trim(),
            address: cleanCustomerAddress,
            billingAddress: cleanCustomerAddress,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const hasMachine = Boolean(
        machineSize.trim() || machineType.trim() || machineSerialNumber.trim()
      );
      const machine = hasMachine
        ? {
            size: machineSize.trim() || "..",
            type: machineType.trim() || "..",
            serialNumber: machineSerialNumber.trim() || "..",
          }
        : null;

      if (machine) {
        await setDoc(
          doc(db, "machines", machineDocumentId(
            machine.serialNumber === ".." ? "" : machine.serialNumber,
            machine.type === ".." ? "" : machine.type,
            machine.size === ".." ? "" : machine.size,
            customer
          )),
          {
            ...machine,
            sn: machine.serialNumber,
            customerName: customer.trim(),
            customerId: customerDocumentId(customer),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const invoice = await addDoc(collection(db, "invoices"), {
        invoiceRef,
        orderId: order.id,
        orderRef: order.orderRef || order.reference || order.id,
        customer: customer.trim(),
        customerAddress: cleanCustomerAddress,
        machine,
        lines: lines.map(line => ({ ...line, quantity: Number(line.quantity || 0), unitPrice: Number(line.unitPrice || 0), lineTotal: Number(line.quantity || 0) * Number(line.unitPrice || 0) })),
        subtotal: Number(totals.subtotal.toFixed(2)),
        total: Number(totals.total.toFixed(2)),
        notes: notes.trim(),
        reason: order.reason || "",
        fleet: order.fleet || order.fleetNumber || "",
        orderedBy: order.user || order.userName || order.orderedBy || "",
        status: "Draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "orders", order.id), {
        invoiceId: invoice.id,
        invoiceRef,
        invoiceStatus: "Draft",
        invoicedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const pdf = await buildInvoicePdf({
        invoiceRef, order, customer: customer.trim(), customerAddress: cleanCustomerAddress,
        machine, lines, totals, notes: notes.trim(),
      });
      const pdfInfo = { pdf, fileName: `${invoiceRef}.pdf`, invoiceRef };
      setGeneratedPdf(pdfInfo);
      onCreated(invoiceRef, pdfInfo);
    } catch (invoiceError) {
      setError(invoiceError?.message || "Unable to create the invoice.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="ma-invoice-backdrop" onMouseDown={onClose}>
    <form className="ma-invoice-dialog" onSubmit={createInvoice} onMouseDown={event => event.stopPropagation()}>
      <header><div><span className="ma-eyebrow">Order {order.orderRef || order.id}</span><h2>Create invoice</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="ma-invoice-scroll">
        <div className="ma-invoice-order-summary">
          <div><span>Reason</span><strong>{order.reason || "Not provided"}</strong></div>
          <div><span>Fleet number</span><strong>{order.fleet || order.fleetNumber || "Not provided"}</strong></div>
          <div><span>Ordered by</span><strong>{order.user || order.userName || order.orderedBy || "Not provided"}</strong></div>
          <div><span>Machine size</span><strong>{machineSize || "Not provided"}</strong></div>
        </div>
        <div className="ma-invoice-customer">
          <label className="ma-field"><span>Bill to</span><input required value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Customer or company"/></label>
          <label className="ma-field"><span>Customer address</span><textarea value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} placeholder=".."/></label>
        </div>
        <div className="ma-machine-fields">
          <span className="ma-eyebrow">Machine details (optional)</span>
          <div>
            <label className="ma-field"><span>Size</span><input value={machineSize} onChange={event => setMachineSize(event.target.value)} placeholder="Machine size"/></label>
            <label className="ma-field"><span>Type</span><input value={machineType} onChange={event => setMachineType(event.target.value)} placeholder="Machine type"/></label>
            <label className="ma-field"><span>S.N.</span><input value={machineSerialNumber} onChange={event => setMachineSerialNumber(event.target.value)} placeholder="Serial number"/></label>
          </div>
        </div>
        <div className="ma-invoice-lines">
          <div className="ma-invoice-line headings"><span>Item</span><span>Qty</span><span>Unit price</span><span>Total</span></div>
          {lines.map((line, index) => <div className="ma-invoice-line" key={line.id}>
            <div><strong>{line.name}</strong><small>{[line.sku, line.size ? `Size: ${line.size}` : "", line.description].filter(Boolean).join(" · ")}</small></div>
            <input type="number" min="0" step="1" value={line.quantity} onChange={event => updateLine(index, "quantity", event.target.value)}/>
            <div className="ma-money-input">£<input type="number" min="0" step=".01" value={line.unitPrice} onChange={event => updateLine(index, "unitPrice", event.target.value)}/></div>
            <strong>£{(Number(line.quantity || 0) * Number(line.unitPrice || 0)).toFixed(2)}</strong>
          </div>)}
        </div>
        <div className="ma-invoice-bottom">
          <label className="ma-field"><span>Invoice notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Payment terms or notes"/></label>
          <div className="ma-invoice-totals"><p><span>Subtotal</span><strong>£{totals.subtotal.toFixed(2)}</strong></p><p className="total"><span>Total</span><strong>£{totals.total.toFixed(2)}</strong></p></div>
        </div>
        {error && <p className="ma-invoice-error">{error}</p>}
      </div>
      <footer>
        {generatedPdf ? <>
          <button type="button" className="ma-secondary" onClick={onClose}>Done</button>
          <button type="button" className="ma-secondary" onClick={() => generatedPdf.pdf.save(generatedPdf.fileName)}>Download PDF</button>
          <button type="button" className="ma-primary" onClick={() => {
            generatedPdf.pdf.autoPrint();
            window.open(generatedPdf.pdf.output("bloburl"), "_blank", "noopener,noreferrer");
          }}>Print PDF</button>
        </> : <>
          <button type="button" className="ma-secondary" onClick={onClose}>Cancel</button>
          <button className="ma-primary" disabled={saving || !lines.length}>{saving ? "Creating PDF…" : "Create PDF invoice"}</button>
        </>}
      </footer>
    </form>
  </div>;
}
