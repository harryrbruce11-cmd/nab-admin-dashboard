import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, onSnapshot, serverTimestamp, Timestamp } from "firebase/firestore";
import "./fuelHistory.css";

const SOURCES = [
  { id: "nab", label: "NAB", collection: "fuelBookings", colour: "#0874ee" },
  { id: "hirenet", label: "HireNet", collection: "hirenetBookings", colour: "#f59e0b" },
  { id: "adblue", label: "AdBlue", collection: "adblueBookings", colour: "#06b6d4" },
];

function first(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== "") ?? "";
}

function numberFrom(...values) {
  const value = Number(first(...values, 0));
  return Number.isFinite(value) ? value : 0;
}

function dateFrom(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function normaliseRecord(snapshot, source) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    source: source.id,
    sourceLabel: source.label,
    date: dateFrom(first(data.fuelDate, data.date, data.bookingDate, data.createdAt, data.timestamp)),
    litres: numberFrom(data.litres, data.liters, data.quantity, data.amountLitres, data.fuelAmount),
    totalCost: numberFrom(data.totalCost, data.cost, data.total, data.amount, data.price),
    pricePerLitre: numberFrom(data.pricePerLitre, data.unitPrice, data.pencePerLitre),
    vehicle: first(data.vehicle, data.registration, data.reg, data.vehicleRegistration, data.machine),
    driver: first(data.driver, data.employeeName, data.bookedBy, data.userName, data.name),
    reference: first(data.reference, data.receiptNumber, data.invoiceNumber, data.bookingReference),
    notes: first(data.notes, data.comment, data.description),
  };
}

function money(value) { return Number(value || 0).toLocaleString("en-GB", { style: "currency", currency: "GBP" }); }
function displayDate(value) { return value ? value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ".."; }

export default function FuelHistory({ db, user, onBack }) {
  const [records, setRecords] = useState([]);
  const [activeSource, setActiveSource] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ source: "nab", date: new Date().toISOString().slice(0, 10), litres: "", totalCost: "", pricePerLitre: "", vehicle: "", driver: "", reference: "", notes: "" });

  useEffect(() => {
    const sourceRecords = new Map(SOURCES.map(source => [source.id, []]));
    const publish = () => setRecords(SOURCES.flatMap(source => sourceRecords.get(source.id) || []).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
    const stops = SOURCES.map(source => onSnapshot(collection(db, source.collection), snapshot => {
      sourceRecords.set(source.id, snapshot.docs.map(item => normaliseRecord(item, source)));
      publish();
    }, error => setMessage(error?.message || `Could not load ${source.label} history.`)));
    return () => stops.forEach(stop => stop());
  }, [db]);

  const filtered = useMemo(() => records.filter(record => {
    const matchesSource = activeSource === "all" || record.source === activeSource;
    const haystack = [record.sourceLabel, record.vehicle, record.driver, record.reference, record.notes].join(" ").toLowerCase();
    return matchesSource && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  }), [records, activeSource, search]);

  const totals = useMemo(() => filtered.reduce((result, record) => ({ litres: result.litres + record.litres, cost: result.cost + record.totalCost }), { litres: 0, cost: 0 }), [filtered]);

  async function saveRecord(event) {
    event.preventDefault();
    const source = SOURCES.find(item => item.id === form.source);
    const litres = Number(form.litres);
    if (!source || !form.date || !Number.isFinite(litres) || litres <= 0) { setMessage("Choose a source, date and valid litres amount."); return; }
    setSaving(true); setMessage("");
    try {
      await addDoc(collection(db, source.collection), {
        source: source.id,
        sourceName: source.label,
        fuelType: source.id === "adblue" ? "AdBlue" : "Diesel",
        fuelDate: Timestamp.fromDate(new Date(`${form.date}T12:00:00`)),
        litres,
        totalCost: Number(form.totalCost || 0),
        pricePerLitre: Number(form.pricePerLitre || 0),
        vehicle: form.vehicle.trim(),
        driver: form.driver.trim(),
        reference: form.reference.trim(),
        notes: form.notes.trim(),
        createdByUid: user?.uid || "",
        createdByEmail: user?.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm(current => ({ ...current, litres: "", totalCost: "", pricePerLitre: "", vehicle: "", driver: "", reference: "", notes: "" }));
      setShowForm(false);
      setMessage(`${source.label} fuel entry saved.`);
    } catch (error) { setMessage(error?.message || "Could not save the fuel entry."); }
    finally { setSaving(false); }
  }

  function exportCsv() {
    const rows = [["Source", "Date", "Litres", "Total cost", "Price per litre", "Vehicle", "Driver", "Reference", "Notes"], ...filtered.map(record => [record.sourceLabel, displayDate(record.date), record.litres, record.totalCost, record.pricePerLitre, record.vehicle, record.driver, record.reference, record.notes])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `fuel-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="fuel-page">
    <header className="fuel-header"><button onClick={onBack}>← Dashboard</button><div><span>Operations</span><h1>Fuel History</h1><p>NAB, HireNet and AdBlue bookings in one history.</p></div><button className="primary" onClick={() => setShowForm(!showForm)}>{showForm ? "Close form" : "+ Add entry"}</button></header>
    <main className="fuel-content">
      {message && <div className="fuel-message">{message}</div>}
      {showForm && <form className="fuel-form" onSubmit={saveRecord}><header><div><span>New record</span><h2>Add fuel entry</h2></div></header><div className="fuel-form-grid">
        <label><span>Account</span><select value={form.source} onChange={event => setForm({ ...form, source: event.target.value })}>{SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
        <label><span>Date</span><input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required/></label>
        <label><span>Litres</span><input type="number" min="0.01" step="0.01" value={form.litres} onChange={event => setForm({ ...form, litres: event.target.value })} required/></label>
        <label><span>Total cost (£)</span><input type="number" min="0" step="0.01" value={form.totalCost} onChange={event => setForm({ ...form, totalCost: event.target.value })}/></label>
        <label><span>Price per litre (£)</span><input type="number" min="0" step="0.001" value={form.pricePerLitre} onChange={event => setForm({ ...form, pricePerLitre: event.target.value })}/></label>
        <label><span>Vehicle / machine</span><input value={form.vehicle} onChange={event => setForm({ ...form, vehicle: event.target.value })}/></label>
        <label><span>Driver / employee</span><input value={form.driver} onChange={event => setForm({ ...form, driver: event.target.value })}/></label>
        <label><span>Receipt / reference</span><input value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })}/></label>
        <label className="full"><span>Notes</span><textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label>
      </div><footer><button disabled={saving}>{saving ? "Saving…" : "Save fuel entry"}</button></footer></form>}
      <section className="fuel-metrics"><article><span>Entries shown</span><strong>{filtered.length}</strong><small>Across selected accounts</small></article><article><span>Total volume</span><strong>{totals.litres.toLocaleString("en-GB", { maximumFractionDigits: 2 })} L</strong><small>Recorded litres</small></article><article><span>Total cost</span><strong>{money(totals.cost)}</strong><small>Recorded spend</small></article></section>
      <section className="fuel-history-card"><header><div className="fuel-tabs"><button className={activeSource === "all" ? "active" : ""} onClick={() => setActiveSource("all")}>All <b>{records.length}</b></button>{SOURCES.map(source => <button key={source.id} className={activeSource === source.id ? "active" : ""} onClick={() => setActiveSource(source.id)}>{source.label} <b>{records.filter(record => record.source === source.id).length}</b></button>)}</div><div className="fuel-actions"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vehicle, driver or reference"/><button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button></div></header>
        {filtered.length ? <div className="fuel-table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Vehicle / machine</th><th>Driver</th><th>Litres</th><th>Cost</th><th>Reference</th></tr></thead><tbody>{filtered.map(record => <tr key={`${record.source}-${record.id}`}><td>{displayDate(record.date)}</td><td><span className={`fuel-source ${record.source}`}>{record.sourceLabel}</span></td><td>{record.vehicle || ".."}</td><td>{record.driver || ".."}</td><td><strong>{record.litres.toLocaleString("en-GB", { maximumFractionDigits: 2 })} L</strong></td><td>{money(record.totalCost)}</td><td title={record.notes}>{record.reference || ".."}</td></tr>)}</tbody></table></div> : <div className="fuel-empty"><strong>No fuel history yet</strong><span>Add the first {activeSource === "all" ? "NAB, HireNet or AdBlue" : SOURCES.find(source => source.id === activeSource)?.label} entry.</span></div>}
      </section>
    </main>
  </div>;
}
