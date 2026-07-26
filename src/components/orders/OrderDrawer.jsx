import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import PrintingWorkflow from "./PrintingWorkflow";
import "./invoice.css";

function dateTime(value) {
  const date = value?.toDate ? value.toDate() : null;
  return date ? date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function OrderDrawer({ order, db, onClose }) {
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(null);
  if (!order) return null;
  const items = Array.isArray(order.items) ? order.items : [];
  const isReturn = `${order.status} ${order.processingStatus}`.toLowerCase().includes("return");
  const status = order.processingStatus || order.status || "To pick";
  const quantity = items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);

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
        {order.pdfUrl && <a className="ma-pdf" href={order.pdfUrl} target="_blank" rel="noreferrer">▧ Open {isReturn ? "returned-parts" : "order"} PDF <span>↗</span></a>}
        {!isReturn && <button className="ma-invoice-action" onClick={() => setShowInvoice(true)}>
          <span>£</span><div><strong>{invoiceCreated || order.invoiceId ? "Invoice created" : "Convert order to invoice"}</strong><small>{invoiceCreated || order.invoiceRef || "Create a bill for this customer"}</small></div><b>›</b>
        </button>}
        <PrintingWorkflow order={order} db={db}/>
      </div>
      {showInvoice && (
        <InvoiceDialog
          order={order}
          db={db}
          onClose={() => setShowInvoice(false)}
          onCreated={invoiceRef => {
            setInvoiceCreated(invoiceRef);
            setShowInvoice(false);
          }}
        />
      )}
    </aside>
  </div>;
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
    order.machineSize || order.machine?.size || ""
  );
  const [machineType, setMachineType] = useState(
    order.machineType || order.machine?.type || order.fleet || ""
  );
  const [machineSerialNumber, setMachineSerialNumber] = useState(
    order.serialNumber || order.machineSerialNumber || order.machine?.serialNumber || order.machine?.sn || ""
  );
  const [vatRate, setVatRate] = useState(20);
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState(() => (order.items || []).map((item, index) => ({
    id: item.id || item.sku || String(index),
    productId: item.productId || item.id || "",
    name: item.name || "Unnamed product",
    sku: item.sku || "",
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
    const vat = subtotal * (Number(vatRate || 0) / 100);
    return { subtotal, vat, total: subtotal + vat };
  }, [lines, vatRate]);

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
        vatRate: Number(vatRate || 0),
        vat: Number(totals.vat.toFixed(2)),
        total: Number(totals.total.toFixed(2)),
        notes: notes.trim(),
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
      onCreated(invoiceRef);
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
            <div><strong>{line.name}</strong><small>{line.sku}</small></div>
            <input type="number" min="0" step="1" value={line.quantity} onChange={event => updateLine(index, "quantity", event.target.value)}/>
            <div className="ma-money-input">£<input type="number" min="0" step=".01" value={line.unitPrice} onChange={event => updateLine(index, "unitPrice", event.target.value)}/></div>
            <strong>£{(Number(line.quantity || 0) * Number(line.unitPrice || 0)).toFixed(2)}</strong>
          </div>)}
        </div>
        <div className="ma-invoice-bottom">
          <label className="ma-field"><span>Invoice notes</span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Payment terms or notes"/></label>
          <div className="ma-invoice-totals"><label><span>VAT rate</span><div><input type="number" min="0" step=".01" value={vatRate} onChange={event => setVatRate(event.target.value)}/>%</div></label><p><span>Subtotal</span><strong>£{totals.subtotal.toFixed(2)}</strong></p><p><span>VAT</span><strong>£{totals.vat.toFixed(2)}</strong></p><p className="total"><span>Total</span><strong>£{totals.total.toFixed(2)}</strong></p></div>
        </div>
        {error && <p className="ma-invoice-error">{error}</p>}
      </div>
      <footer><button type="button" className="ma-secondary" onClick={onClose}>Cancel</button><button className="ma-primary" disabled={saving || !lines.length}>{saving ? "Creating…" : "Create draft invoice"}</button></footer>
    </form>
  </div>;
}
