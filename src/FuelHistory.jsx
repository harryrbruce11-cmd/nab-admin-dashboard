import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import "./fuelHistory.css";

const SOURCES = [
  { id: "nab", label: "NAB", collection: "fuelBookings" },
  { id: "hirenet", label: "HireNet", collection: "hirenetBookings" },
  { id: "adblue", label: "AdBlue", collection: "adblueBookings" },
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
    date: dateFrom(first(data.fuelDate, data.date, data.bookingDate, data.createdAt, data.timestamp)),
    litres: numberFrom(data.litres, data.liters, data.quantity, data.amountLitres, data.fuelAmount),
    totalCost: numberFrom(data.totalCost, data.cost, data.total, data.amount, data.price),
    pricePerLitre: numberFrom(data.pricePerLitre, data.unitPrice, data.pencePerLitre),
    fleetNumber: first(data.fleetNumber, data.fleetNo, data.fleet_number, data.fleet, data.vehicleFleetNumber),
    vehicle: first(data.vehicle, data.registration, data.reg, data.vehicleRegistration, data.machine),
    driver: first(data.driver, data.employeeName, data.bookedBy, data.userName, data.name),
    reference: first(data.reference, data.receiptNumber, data.invoiceNumber, data.bookingReference),
    notes: first(data.notes, data.comment, data.description),
  };
}

function money(value) {
  return Number(value || 0).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

function displayDate(value) {
  return value ? value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "..";
}

export default function FuelHistory({ db, onBack }) {
  const [records, setRecords] = useState([]);
  const [activeSource, setActiveSource] = useState("nab");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sourceRecords = new Map(SOURCES.map(source => [source.id, []]));
    const publish = () => setRecords(SOURCES.flatMap(source => sourceRecords.get(source.id) || []).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
    const stops = SOURCES.map(source => onSnapshot(collection(db, source.collection), snapshot => {
      sourceRecords.set(source.id, snapshot.docs.map(item => normaliseRecord(item, source)));
      publish();
    }, error => setMessage(error?.message || `Could not load ${source.label} history.`)));
    return () => stops.forEach(stop => stop());
  }, [db]);

  const selectedSource = SOURCES.find(source => source.id === activeSource) || SOURCES[0];
  const filtered = useMemo(() => records.filter(record => {
    const haystack = [record.fleetNumber, record.vehicle, record.driver, record.reference, record.notes].join(" ").toLowerCase();
    return record.source === activeSource && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  }), [records, activeSource, search]);
  const totals = useMemo(() => filtered.reduce((result, record) => ({ litres: result.litres + record.litres, cost: result.cost + record.totalCost }), { litres: 0, cost: 0 }), [filtered]);

  function exportCsv() {
    const rows = [["Date", "Fleet number", "Vehicle / machine", "Driver", "Litres", "Total cost", "Price per litre", "Reference", "Notes"], ...filtered.map(record => [displayDate(record.date), record.fleetNumber, record.vehicle, record.driver, record.litres, record.totalCost, record.pricePerLitre, record.reference, record.notes])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${activeSource}-fuel-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="fuel-page">
    <header className="fuel-header"><button onClick={onBack}>← Dashboard</button><div><span>Operations</span><h1>Fuel History</h1><p>Separate NAB, HireNet and AdBlue history.</p></div><div /></header>
    <main className="fuel-content">
      {message && <div className="fuel-message">{message}</div>}
      <nav className="fuel-account-views" aria-label="Fuel history account">{SOURCES.map(source => {
        const count = records.filter(record => record.source === source.id).length;
        return <button key={source.id} className={`${source.id} ${activeSource === source.id ? "active" : ""}`} onClick={() => { setActiveSource(source.id); setSearch(""); }}><span>{source.label}</span><strong>{count}</strong><small>View {source.label} history</small></button>;
      })}</nav>
      <section className="fuel-metrics"><article><span>{selectedSource.label} entries</span><strong>{filtered.length}</strong><small>Records in this view</small></article><article><span>Total volume</span><strong>{totals.litres.toLocaleString("en-GB", { maximumFractionDigits: 2 })} L</strong><small>{selectedSource.label} recorded litres</small></article><article><span>Total cost</span><strong>{money(totals.cost)}</strong><small>{selectedSource.label} recorded spend</small></article></section>
      <section className="fuel-history-card"><header><div className="fuel-view-title"><span>{selectedSource.label}</span><strong>Fuel history</strong></div><div className="fuel-actions"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search fleet no., vehicle or driver"/><button onClick={exportCsv} disabled={!filtered.length}>Export CSV</button></div></header>
        {filtered.length ? <div className="fuel-table-wrap"><table><thead><tr><th>Date</th><th>Fleet number</th><th>Vehicle / machine</th><th>Driver</th><th>Litres</th><th>Cost</th><th>Reference</th></tr></thead><tbody>{filtered.map(record => <tr key={`${record.source}-${record.id}`}><td>{displayDate(record.date)}</td><td><strong>{record.fleetNumber || ".."}</strong></td><td>{record.vehicle || ".."}</td><td>{record.driver || ".."}</td><td><strong>{record.litres.toLocaleString("en-GB", { maximumFractionDigits: 2 })} L</strong></td><td>{money(record.totalCost)}</td><td title={record.notes}>{record.reference || ".."}</td></tr>)}</tbody></table></div> : <div className="fuel-empty"><strong>No {selectedSource.label} fuel history found</strong><span>Fuel bookings will appear here automatically.</span></div>}
      </section>
    </main>
  </div>;
}
