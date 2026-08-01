import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { jsPDF } from "jspdf";

const COLLECTIONS = ["vehicleChecks", "vehicles"];

function parseDate(value) {
  const date = value?.toDate ? value.toDate() : value?._seconds ? new Date(value._seconds * 1000) : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
}

function normaliseCheck(check) {
  const date = parseDate(firstValue(check.submittedAt, check.completedAt, check.createdAt, check.checkDate, check.date, check.timestamp));
  const mileage = Number(firstValue(check.mileage, check.odometer, check.currentMileage, check.vehicleMileage, check.miles));
  const inspectionChecks = Array.isArray(check.checks) ? check.checks.map(item => ({
    id: item.id || item.title,
    title: item.title || "Vehicle check",
    description: item.description || "",
    result: item.result || "Not recorded",
    defectNotes: item.defectNotes || "",
  })) : [];
  const failedChecks = inspectionChecks.filter(item => !["pass", "passed", "ok"].includes(String(item.result).trim().toLowerCase()));
  const nestedDefects = inspectionChecks.filter(item => item.defectNotes.trim()).map(item => `${item.title}: ${item.defectNotes}`);
  const defects = firstValue(nestedDefects.length ? nestedDefects : null, check.defects, check.issues, check.faults, check.notes, check.defectNotes, "");
  const hasDefects = check.hasDefects === true || check.defectsFound === true || Number(check.defectCount || 0) > 0 || failedChecks.length > 0 || (Array.isArray(defects) ? defects.length > 0 : Boolean(String(defects || "").trim()));
  return {
    ...check,
    date,
    registration: String(firstValue(check.registration, check.vehicleRegistration, check.reg, check.regNumber, check.vehicleReg, check.fleetNumber, check.vehicle?.registration, check.vehicleName, check.vehicleId, "Unknown vehicle")),
    mileage: Number.isFinite(mileage) ? mileage : null,
    driver: String(firstValue(check.driverName, check.employeeName, check.userName, check.checkedBy, check.driver, check.userEmail, "Not recorded")),
    status: String(firstValue(check.status, check.result, hasDefects ? "Attention needed" : "Completed")),
    defects: Array.isArray(defects) ? defects.map(item => typeof item === "string" ? item : item?.name || item?.description).filter(Boolean).join(", ") : String(defects || ""),
    hasDefects,
    inspectionChecks,
    passedChecks: inspectionChecks.filter(item => ["pass", "passed", "ok"].includes(String(item.result).trim().toLowerCase())).length,
  };
}

function normaliseVehicle(vehicle) {
  const dvla = vehicle.dvlaData || {};
  return {
    id: vehicle.id,
    registration: String(firstValue(vehicle.registrationNumber, vehicle.reg, dvla.registrationNumber, vehicle.id, "Unknown vehicle")).replace(/\s+/g, "").toUpperCase(),
    name: String(firstValue(vehicle.name, "")),
    make: String(firstValue(vehicle.make, dvla.make, "")),
    model: String(firstValue(vehicle.model, dvla.model, "")),
    imageUrl: String(firstValue(vehicle.imageUrl, "")),
    fuelType: String(firstValue(vehicle.fuelType, dvla.fuelType, "")),
    colour: String(firstValue(vehicle.colour, dvla.colour, "")),
    taxStatus: String(firstValue(vehicle.taxStatus, dvla.taxStatus, "")),
  };
}

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function printableReport(monthLabel, rows, summaries) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  return `<!doctype html><html><head><title>Vehicle checks - ${escape(monthLabel)}</title><style>body{font:13px Arial,sans-serif;color:#172033;margin:30px}h1{margin:0}p{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border:1px solid #dbe2ea;text-align:left;vertical-align:top}th{background:#edf4fb;font-size:10px;text-transform:uppercase}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}.summary div{padding:12px;border:1px solid #dbe2ea;border-radius:8px}.summary strong,.summary span{display:block}.summary strong{font-size:18px}.summary span{color:#64748b;font-size:10px}.checklist{font-size:10px;line-height:1.5}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h1>Vehicle Check Report</h1><p>${escape(monthLabel)} · Generated ${escape(new Date().toLocaleString("en-GB"))}</p><div class="summary"><div><strong>${rows.length}</strong><span>Checks</span></div><div><strong>${summaries.length}</strong><span>Vehicles</span></div><div><strong>${summaries.reduce((sum,item)=>sum+item.distance,0).toLocaleString("en-GB")}</strong><span>Miles recorded</span></div><div><strong>${rows.filter(row=>row.hasDefects).length}</strong><span>Checks with issues</span></div></div><table><thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Mileage</th><th>Status</th><th>Checklist</th><th>Issues</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.date?.toLocaleString("en-GB") || "No date")}</td><td>${escape(row.registration)}</td><td>${escape(row.driver)}</td><td>${escape(row.mileage?.toLocaleString("en-GB") ?? "—")}</td><td>${escape(row.status)}</td><td class="checklist">${row.inspectionChecks.map(item => `${escape(item.title)}: ${escape(item.result)}`).join("<br>") || "—"}</td><td>${escape(row.defects || "None")}</td></tr>`).join("")}</tbody></table></body></html>`;
}

export default function VehicleCheckDashboard({ db }) {
  const [sources, setSources] = useState({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(monthValue());
  const [vehicle, setVehicle] = useState("all");
  const [printer, setPrinter] = useState("");

  useEffect(() => {
    let settled = 0;
    const finish = () => { settled += 1; if (settled === COLLECTIONS.length) setLoading(false); };
    const stops = COLLECTIONS.map(name => onSnapshot(collection(db, name), snapshot => {
      setSources(current => ({ ...current, [name]: snapshot.docs.map(item => ({ id: `${name}:${item.id}`, source: name, ...item.data() })) }));
      finish();
    }, () => finish()));
    return () => stops.forEach(stop => stop());
  }, [db]);

  useEffect(() => {
    window.electronPrint?.getPrinters?.().then(items => {
      const selected = items?.find(item => item.isDefault) || items?.[0];
      setPrinter(selected?.name || "");
    }).catch(() => {});
  }, []);

  const checks = useMemo(() => (sources.vehicleChecks || []).map(normaliseCheck).filter(check => check.date).sort((a, b) => b.date - a.date), [sources.vehicleChecks]);
  const vehicleRecords = useMemo(() => (sources.vehicles || []).map(normaliseVehicle), [sources.vehicles]);
  const vehicles = useMemo(() => [...new Set([...vehicleRecords.map(item => item.registration), ...checks.map(check => check.registration.replace(/\s+/g, "").toUpperCase())])].sort(), [checks, vehicleRecords]);
  const fleet = useMemo(() => vehicles.map(registration => {
    const record = vehicleRecords.find(item => item.registration === registration);
    const vehicleChecks = checks.filter(check => check.registration.replace(/\s+/g, "").toUpperCase() === registration);
    const latest = vehicleChecks[0];
    const latestMileageCheck = vehicleChecks.find(check => check.mileage !== null);
    return {
      registration,
      name: record?.name || "",
      make: record?.make || latest?.make || "",
      model: record?.model || latest?.model || "",
      imageUrl: record?.imageUrl || "",
      fuelType: record?.fuelType || "",
      colour: record?.colour || "",
      mileage: latestMileageCheck?.mileage ?? null,
      lastChecked: latest?.date || null,
      totalChecks: vehicleChecks.length,
      hasDefects: latest?.hasDefects || false,
    };
  }), [checks, vehicleRecords, vehicles]);
  const filtered = useMemo(() => checks.filter(check => monthValue(check.date) === month && (vehicle === "all" || check.registration.replace(/\s+/g, "").toUpperCase() === vehicle)), [checks, month, vehicle]);
  const summaries = useMemo(() => {
    const groups = new Map();
    filtered.forEach(check => {
      if (!groups.has(check.registration)) groups.set(check.registration, []);
      groups.get(check.registration).push(check);
    });
    return [...groups.entries()].map(([registration, vehicleChecks]) => {
      const readings = vehicleChecks.filter(check => check.mileage !== null).sort((a, b) => a.date - b.date);
      const opening = readings[0]?.mileage ?? null;
      const closing = readings.at(-1)?.mileage ?? null;
      return { registration, checks: vehicleChecks.length, opening, closing, distance: opening !== null && closing !== null ? Math.max(closing - opening, 0) : 0, issues: vehicleChecks.filter(check => check.hasDefects).length };
    }).sort((a, b) => a.registration.localeCompare(b.registration));
  }, [filtered]);

  const selectedMonthDate = new Date(`${month}-01T12:00:00`);
  const monthLabel = Number.isNaN(selectedMonthDate.getTime()) ? month : selectedMonthDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalMiles = summaries.reduce((sum, item) => sum + item.distance, 0);

  function createPdfReport() {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15;
    let y = 18;
    const addHeader = () => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("Vehicle Check Report", margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      pdf.text(monthLabel, margin, y + 7);
      pdf.setTextColor(30);
      y += 17;
    };
    addHeader();
    pdf.setFontSize(10);
    pdf.text(`Checks: ${filtered.length}`, margin, y);
    pdf.text(`Vehicles: ${summaries.length}`, 60, y);
    pdf.text(`Miles recorded: ${totalMiles.toLocaleString("en-GB")}`, 105, y);
    pdf.text(`Issues: ${filtered.filter(check => check.hasDefects).length}`, 170, y);
    y += 10;
    filtered.forEach(check => {
      if (y > 272) {
        pdf.addPage();
        y = 18;
        addHeader();
      }
      pdf.setFillColor(245, 248, 252);
      pdf.rect(margin, y, 180, 22, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(check.registration, margin + 3, y + 6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(`${check.date.toLocaleString("en-GB")}  |  ${check.driver}`, margin + 3, y + 12);
      pdf.text(`Mileage: ${check.mileage?.toLocaleString("en-GB") ?? "Not recorded"}  |  Status: ${check.status}`, margin + 3, y + 18);
      y += 26;
    });
    return pdf;
  }

  async function printReport() {
    if (!window.electronPrint?.printGeneratedPdf) {
      window.alert("Printing is not available until the desktop app is restarted.");
      return;
    }
    const pdf = createPdfReport();
    const result = await window.electronPrint.printGeneratedPdf({ pdfBase64: pdf.output("datauristring"), deviceName: printer });
    window.alert(result?.ok ? "The PDF report was sent to the printer." : result?.message || "The report could not be printed.");
  }

  async function downloadPdfReport() {
    const pdf = createPdfReport();
    const fileName = `vehicle-check-report-${month}.pdf`;
    if (window.electronPrint?.savePdf) {
      const result = await window.electronPrint.savePdf({ pdfBase64: pdf.output("datauristring"), fileName });
      if (!result?.ok && !result?.canceled) window.alert(result?.message || "The PDF could not be saved.");
    } else {
      pdf.save(fileName);
    }
  }

  return <div className="admin-vehicle-checks">
    <div className="admin-section-title"><div><span>Vehicle Check / live data</span><h2>Vehicle checks</h2><p>Review completed checks and monthly mileage for every vehicle.</p></div><em className="live">Live</em></div>
    <div className="vehicle-check-toolbar"><label><span>Month</span><input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><label><span>Vehicle</span><select value={vehicle} onChange={event => setVehicle(event.target.value)}><option value="all">All vehicles</option>{vehicles.map(item => <option key={item}>{item}</option>)}</select></label><div className="vehicle-report-actions"><button type="button" onClick={printReport} disabled={!filtered.length}>Print report</button><button type="button" onClick={downloadPdfReport} disabled={!filtered.length}>Download PDF</button></div></div>
    <div className="vehicle-check-stats"><article><span>Checks</span><strong>{filtered.length}</strong></article><article><span>Vehicles</span><strong>{summaries.length}</strong></article><article><span>Miles this month</span><strong>{totalMiles.toLocaleString("en-GB")}</strong></article><article className={filtered.some(check => check.hasDefects) ? "warning" : ""}><span>Checks with issues</span><strong>{filtered.filter(check => check.hasDefects).length}</strong></article></div>
    <section className="vehicle-fleet-card"><header><div><span>Fleet overview</span><h3>All vehicles</h3></div><b>{fleet.length}</b></header>{fleet.length ? <div className="vehicle-fleet-grid">{fleet.map(item => <button type="button" className={vehicle === item.registration ? "selected" : ""} key={item.registration} onClick={() => setVehicle(item.registration)}>{item.imageUrl ? <img className="vehicle-fleet-image" src={item.imageUrl} alt={item.registration}/> : <span className="vehicle-fleet-icon">▱</span>}<strong>{item.registration}</strong><small>{item.name || [item.make, item.model].filter(Boolean).join(" ") || "Vehicle details unavailable"}</small><small>{[item.colour, item.fuelType].filter(Boolean).join(" · ")}</small><div><span>Latest mileage</span><b>{item.mileage?.toLocaleString("en-GB") ?? "—"}</b></div><footer><span>{item.lastChecked ? item.lastChecked.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not checked"}</span><em className={item.hasDefects ? "attention" : "clear"}>{item.hasDefects ? "Attention" : `${item.totalChecks} checks`}</em></footer></button>)}</div> : <div className="vehicle-check-empty">{loading ? "Loading vehicles…" : "No vehicles found."}</div>}</section>
    <section className="vehicle-mileage-card"><header><div><span>Monthly mileage</span><h3>{monthLabel}</h3></div></header>{summaries.length ? <div className="vehicle-mileage-grid">{summaries.map(item => <article key={item.registration}><header><strong>{item.registration}</strong><span>{item.checks} check{item.checks === 1 ? "" : "s"}</span></header><div><span>Opening mileage <b>{item.opening?.toLocaleString("en-GB") ?? "—"}</b></span><span>Closing mileage <b>{item.closing?.toLocaleString("en-GB") ?? "—"}</b></span></div><footer><span>Miles recorded</span><strong>{item.distance.toLocaleString("en-GB")}</strong></footer>{item.issues > 0 && <em>{item.issues} issue{item.issues === 1 ? "" : "s"}</em>}</article>)}</div> : <div className="vehicle-check-empty">{loading ? "Loading vehicle checks…" : "No vehicle checks found for this month."}</div>}</section>
    <section className="vehicle-check-table-card"><header><div><span>Check history</span><h3>All checks for {monthLabel}</h3></div><b>{filtered.length}</b></header><div className="vehicle-check-table"><table><thead><tr><th>Date</th><th>Vehicle</th><th>Driver</th><th>Mileage</th><th>Status</th><th>Checklist</th><th>Issues</th></tr></thead><tbody>{filtered.map(check => <tr key={check.id}><td>{check.date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td><strong>{check.registration}</strong><small>{[check.make, check.model].filter(Boolean).join(" ")}</small></td><td>{check.driver}</td><td>{check.mileage?.toLocaleString("en-GB") ?? "—"}</td><td><span className={check.hasDefects ? "check-warning" : "check-ok"}>{check.status}</span></td><td><details className="vehicle-check-details"><summary>{check.passedChecks}/{check.inspectionChecks.length} passed</summary><div>{check.inspectionChecks.map(item => <span key={item.id}><b>{item.title}</b><em className={["pass", "passed", "ok"].includes(String(item.result).toLowerCase()) ? "pass" : "fail"}>{item.result}</em>{item.defectNotes && <small>{item.defectNotes}</small>}</span>)}</div></details></td><td>{check.defects || "None"}</td></tr>)}</tbody></table></div></section>
  </div>;
}
