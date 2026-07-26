import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import KioskControl from "./KioskControl";
import { isValidHexColour, isValidHttpsUrl, isValidKioskVersion } from "./kioskControlUtils.mjs";
import "./adminScreen.css";

const ADMIN_SESSION_KEY = "nab-admin-dashboard:admin-unlocked";

const defaultTools = [
  ["kiosk", "Kiosk editor", "Change kiosk messages, availability and display settings.", "▣"],
  ["updates", "App updates", "Check versions and manage application releases.", "↻"],
  ["holidays", "Holiday approvals", "Approve or reject pending staff holiday requests.", "▦"],
  ["invoices", "Invoices", "Review draft and generated customer invoices.", "£"],
  ["customers", "Customers", "Maintain saved customer names and addresses.", "♙"],
  ["machines", "Machines", "Maintain machine size, type and serial numbers.", "◇"],
  ["system", "System tools", "Reserved for additional administrative tools.", "⚙"],
];

export default function AdminScreen({ db, holidayDb, storage, functions, user, version, onBack, onCheckForUpdates }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_SESSION_KEY) === "yes");
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [activeTool, setActiveTool] = useState("kiosk");
  const [counts, setCounts] = useState({ invoices: 0, customers: 0, machines: 0 });
  const [kiosk, setKiosk] = useState({
    apkUrl: "",
    backgroundColorBottom: "#020617",
    backgroundColorTop: "#0ea5e9",
    buttonText: "Tap Here To Order Parts",
    enabled: true,
    fullScreenTap: false,
    hideButton: false,
    hideLogo: false,
    hideSubtitle: true,
    hideTitle: true,
    hintText: "Tap here to begin",
    logoUrl: "",
    logoUrls: [],
    subtitle: "Nab Kiosk is protected by UK copyright law.",
    textColor: "",
    title: "Welcome To NAB Kiosk",
    version: "1.0.3",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [logoUrlDraft, setLogoUrlDraft] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [draggedLogo, setDraggedLogo] = useState(-1);
  const [toolOrder, setToolOrder] = useState(defaultTools.map(tool => tool[0]));
  const [draggedTool, setDraggedTool] = useState("");

  const tools = toolOrder.map(id => defaultTools.find(tool => tool[0] === id)).filter(Boolean);

  useEffect(() => {
    if (!unlocked) return undefined;
    const stops = ["invoices", "customers", "machines"].map(name =>
      onSnapshot(collection(db, name), snapshot =>
        setCounts(current => ({ ...current, [name]: snapshot.size }))
      )
    );
    const kioskStop = onSnapshot(doc(db, "settings", "stores_kiosk"), snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const logoUrls = Array.isArray(data.logoUrls) && data.logoUrls.length
          ? data.logoUrls
          : data.logoUrl ? [data.logoUrl] : [];
        setKiosk(current => ({ ...current, ...data, logoUrls }));
      }
    });
    const layoutStop = onSnapshot(doc(db, "settings", "admin_layout"), snapshot => {
      const savedOrder = snapshot.data()?.toolOrder;
      if (Array.isArray(savedOrder)) {
        const valid = savedOrder.filter(id => defaultTools.some(tool => tool[0] === id));
        const missing = defaultTools.map(tool => tool[0]).filter(id => !valid.includes(id));
        setToolOrder([...valid, ...missing]);
      }
    });
    return () => { stops.forEach(stop => stop()); kioskStop(); layoutStop(); };
  }, [db, unlocked]);

  async function unlock(event) {
    event.preventDefault();
    setUnlocking(true);
    setError("");
    try {
      const verify = httpsCallable(functions, "verifyAdminPassword");
      const result = await verify({ password });
      if (!result.data?.ok) throw new Error("Admin access was not approved.");
      sessionStorage.setItem(ADMIN_SESSION_KEY, "yes");
      setPassword("");
      setUnlocked(true);
    } catch (unlockError) {
      setError(unlockError?.message?.replace("FirebaseError: ", "") || "Incorrect admin password.");
    } finally {
      setUnlocking(false);
    }
  }

  function lock() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setUnlocked(false);
    setActiveTool("kiosk");
  }

  async function saveKiosk(event) {
    event.preventDefault();
    setSaving(true);
    setSaved("");
    try {
      if (!isValidKioskVersion(kiosk.version)) throw new Error("Version must use semantic versioning, for example 1.2.3.");
      if (!isValidHttpsUrl(kiosk.apkUrl)) throw new Error("APK URL must be a valid HTTPS address.");
      if (!isValidHexColour(kiosk.backgroundColorTop) || !isValidHexColour(kiosk.backgroundColorBottom) || !isValidHexColour(kiosk.textColor, true)) throw new Error("Colours must use six-digit hexadecimal values, for example #0ea5e9.");
      await setDoc(doc(db, "settings", "stores_kiosk"), {
        ...kiosk,
        logoUrl: kiosk.logoUrls?.[0] || "",
        logoUrls: kiosk.logoUrls || [],
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved("Kiosk settings saved.");
    } catch (saveError) {
      setSaved(saveError?.message || "Could not save kiosk settings.");
    } finally {
      setSaving(false);
    }
  }

  function addLogoUrl() {
    const url = logoUrlDraft.trim();
    if (!url || kiosk.logoUrls?.includes(url)) return;
    setKiosk(current => ({ ...current, logoUrls: [...(current.logoUrls || []), url], logoUrl: current.logoUrl || url }));
    setLogoUrlDraft("");
  }

  async function pickLogoFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploadingLogo(true);
    setSaved("");
    try {
      const urls = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const fileRef = ref(storage, `kiosk/logos/${Date.now()}-${safeName}`);
        await uploadBytes(fileRef, file, { contentType: file.type });
        urls.push(await getDownloadURL(fileRef));
      }
      setKiosk(current => ({ ...current, logoUrls: [...(current.logoUrls || []), ...urls], logoUrl: current.logoUrl || urls[0] || "" }));
      setSaved(`${urls.length} image${urls.length === 1 ? "" : "s"} uploaded. Save settings to publish the layout.`);
    } catch (error) {
      setSaved(error?.message || "Could not upload the selected images.");
    } finally {
      event.target.value = "";
      setUploadingLogo(false);
    }
  }

  function moveLogo(from, to) {
    if (from === to || from < 0 || to < 0) return;
    setKiosk(current => {
      const logoUrls = [...(current.logoUrls || [])];
      const [item] = logoUrls.splice(from, 1);
      logoUrls.splice(to, 0, item);
      return { ...current, logoUrls, logoUrl: logoUrls[0] || "" };
    });
  }

  async function moveTool(fromId, toId) {
    if (!fromId || fromId === toId) return;
    const next = [...toolOrder];
    const from = next.indexOf(fromId);
    const to = next.indexOf(toId);
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    setToolOrder(next);
    await setDoc(doc(db, "settings", "admin_layout"), { toolOrder: next, updatedAt: serverTimestamp() }, { merge: true });
  }

  if (!unlocked) return <div className="admin-page admin-lock-page">
    <button className="admin-back" onClick={onBack}>← Back</button>
    <form className="admin-lock-card" onSubmit={unlock}>
      <div className="admin-lock-icon">⌁</div>
      <span>Restricted area</span>
      <h1>Admin access</h1>
      <p>Enter the separate administrator password to continue.</p>
      <label><span>Admin password</span><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password"/></label>
      {error && <div className="admin-error">{error}</div>}
      <button disabled={unlocking || !password}>{unlocking ? "Checking…" : "Unlock admin"}</button>
    </form>
  </div>;

  return <div className="admin-page">
    <header className="admin-header">
      <button className="admin-back" onClick={onBack}>← Dashboard</button>
      <div><span>Restricted area</span><h1>Admin control centre</h1><p>Kiosk, operational data and application management.</p></div>
      <button className="admin-lock-button" onClick={lock}>Lock admin</button>
    </header>
    <main className="admin-layout">
      <aside className="admin-tools">
        {tools.map(([id, title, description, icon]) => <button key={id} draggable onDragStart={() => setDraggedTool(id)} onDragOver={event => event.preventDefault()} onDrop={() => moveTool(draggedTool, id)} onDragEnd={() => setDraggedTool("")} className={`${activeTool === id ? "active" : ""} ${draggedTool === id ? "dragging" : ""}`} onClick={() => setActiveTool(id)}>
          <i>{icon}</i><span><strong>{title}</strong><small>{description}</small></span>{counts[id] !== undefined && <b>{counts[id]}</b>}
        </button>)}
      </aside>
      <section className="admin-workspace">
        {activeTool === "kiosk" && <div className="admin-kiosk-workspace"><form onSubmit={saveKiosk}>
          <div className="admin-section-title"><div><span>settings / stores_kiosk</span><h2>Edit kiosk configuration</h2><p>Changes save directly to the live Firebase kiosk settings.</p></div><em className={kiosk.enabled ? "live" : "offline"}>{kiosk.enabled ? "Enabled" : "Disabled"}</em></div>
          <div className="admin-form-grid">
            <label><span>Title</span><input value={kiosk.title || ""} onChange={event => setKiosk({...kiosk, title: event.target.value})}/></label>
            <label><span>Version</span><input value={kiosk.version || ""} onChange={event => setKiosk({...kiosk, version: event.target.value})}/></label>
            <label className="full"><span>Subtitle</span><textarea value={kiosk.subtitle || ""} onChange={event => setKiosk({...kiosk, subtitle: event.target.value})}/></label>
            <label><span>Hint text</span><input value={kiosk.hintText || ""} onChange={event => setKiosk({...kiosk, hintText: event.target.value})}/></label>
            <label><span>Button text</span><input value={kiosk.buttonText || ""} onChange={event => setKiosk({...kiosk, buttonText: event.target.value})}/></label>
            <div className="admin-logo-builder full">
              <header><div><span>Logo images</span><small>Drag images to change their display order. The first image remains the primary kiosk logo.</small></div><label className="admin-logo-picker"><input type="file" accept="image/*" multiple onChange={pickLogoFiles}/>{uploadingLogo ? "Uploading…" : "Pick images"}</label></header>
              <div className="admin-logo-url-row"><input value={logoUrlDraft} onChange={event => setLogoUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addLogoUrl(); } }} placeholder="Paste another image URL"/><button type="button" onClick={addLogoUrl}>Add URL</button></div>
              {kiosk.logoUrls?.length ? <div className="admin-logo-list">{kiosk.logoUrls.map((url, index) => <article key={`${url}-${index}`} draggable onDragStart={() => setDraggedLogo(index)} onDragOver={event => event.preventDefault()} onDrop={() => moveLogo(draggedLogo, index)} onDragEnd={() => setDraggedLogo(-1)} className={draggedLogo === index ? "dragging" : ""}>
                <img src={url} alt={`Kiosk logo ${index + 1}`}/><div><strong>{index === 0 ? "Primary logo" : `Image ${index + 1}`}</strong><small>{url}</small></div><button type="button" title="Move left" disabled={index === 0} onClick={() => moveLogo(index, index - 1)}>←</button><button type="button" title="Move right" disabled={index === kiosk.logoUrls.length - 1} onClick={() => moveLogo(index, index + 1)}>→</button><button type="button" className="remove" onClick={() => setKiosk(current => { const logoUrls = current.logoUrls.filter((_, itemIndex) => itemIndex !== index); return {...current, logoUrls, logoUrl: logoUrls[0] || ""}; })}>Remove</button>
              </article>)}</div> : <div className="admin-logo-empty">No logo images added yet.</div>}
            </div>
            <label className="full"><span>APK URL</span><input value={kiosk.apkUrl || ""} onChange={event => setKiosk({...kiosk, apkUrl: event.target.value})}/></label>
            <label className="admin-colour"><span>Background top</span><div><input type="color" value={kiosk.backgroundColorTop || "#0ea5e9"} onChange={event => setKiosk({...kiosk, backgroundColorTop: event.target.value})}/><input value={kiosk.backgroundColorTop || ""} onChange={event => setKiosk({...kiosk, backgroundColorTop: event.target.value})}/></div></label>
            <label className="admin-colour"><span>Background bottom</span><div><input type="color" value={kiosk.backgroundColorBottom || "#020617"} onChange={event => setKiosk({...kiosk, backgroundColorBottom: event.target.value})}/><input value={kiosk.backgroundColorBottom || ""} onChange={event => setKiosk({...kiosk, backgroundColorBottom: event.target.value})}/></div></label>
            <label className="admin-colour"><span>Text colour (optional)</span><div><input type="color" value={kiosk.textColor || "#ffffff"} onChange={event => setKiosk({...kiosk, textColor: event.target.value})}/><input value={kiosk.textColor || ""} onChange={event => setKiosk({...kiosk, textColor: event.target.value})} placeholder="Use kiosk default"/></div></label>
            <div className="admin-kiosk-preview" style={{ background: `linear-gradient(160deg, ${kiosk.backgroundColorTop || "#0ea5e9"}, ${kiosk.backgroundColorBottom || "#020617"})`, color: kiosk.textColor || "#ffffff" }}><small>Live layout preview</small>{!kiosk.hideLogo && <div className="admin-preview-logos">{(kiosk.logoUrls || []).map((url, index) => <img key={`${url}-${index}`} src={url} alt=""/>)}</div>}<strong>{kiosk.hideTitle ? "Title hidden" : kiosk.title}</strong><span>{kiosk.hideSubtitle ? "Subtitle hidden" : kiosk.subtitle}</span>{!kiosk.hideButton && <button type="button">{kiosk.buttonText}</button>}</div>
            {[["enabled", "Kiosk enabled", "Allow the kiosk to run normally."], ["fullScreenTap", "Full-screen tap", "Allow tapping anywhere to begin."], ["hideButton", "Hide button", "Remove the main order button."], ["hideLogo", "Hide logo", "Do not display the kiosk logo."], ["hideSubtitle", "Hide subtitle", "Do not display the subtitle."], ["hideTitle", "Hide title", "Do not display the title."]].map(([field, label, help]) => <label className="admin-toggle full" key={field}><span><strong>{label}</strong><small>{help}</small></span><input type="checkbox" checked={Boolean(kiosk[field])} onChange={event => setKiosk({...kiosk, [field]: event.target.checked})}/></label>)}
          </div>
          <footer>{saved && <span>{saved}</span>}<button disabled={saving}>{saving ? "Saving…" : "Save kiosk settings"}</button></footer>
        </form><KioskControl db={db} functions={functions} user={user}/></div>}
        {activeTool === "updates" && <div className="admin-placeholder"><i>↻</i><span>Application updates</span><h2>Version {version}</h2><p>Check the desktop application for a newer published version.</p><button onClick={onCheckForUpdates}>Check for updates</button></div>}
        {activeTool === "holidays" && (
          <HolidayApprovals
            db={holidayDb}
            peopleDb={db}
            user={user}
            onCount={count => setCounts(current => ({ ...current, holidays: count }))}
          />
        )}
        {["invoices", "customers", "machines", "system"].includes(activeTool) && <div className="admin-placeholder"><i>{tools.find(tool => tool[0] === activeTool)?.[3]}</i><span>Admin module</span><h2>{tools.find(tool => tool[0] === activeTool)?.[1]}</h2><p>{tools.find(tool => tool[0] === activeTool)?.[2]}</p><strong>{counts[activeTool] !== undefined ? `${counts[activeTool]} records available` : "Ready for your next admin tool"}</strong></div>}
      </section>
    </main>
  </div>;
}

function holidayDate(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "..";
}

function localDate(value) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function countWorkingDays(firstDay, lastDay) {
  if (!firstDay || !lastDay || lastDay < firstDay) return 0;
  let days = 0;
  const cursor = new Date(firstDay);
  while (cursor <= lastDay) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function returnToWorkAfter(lastDay) {
  const result = new Date(lastDay);
  do result.setDate(result.getDate() + 1);
  while (result.getDay() === 0 || result.getDay() === 6);
  return result;
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function HolidayApprovals({ db, peopleDb, user, onCount }) {
  const [requests, setRequests] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [closureName, setClosureName] = useState("Christmas holiday");
  const [firstDayOff, setFirstDayOff] = useState(`${new Date().getFullYear()}-12-24`);
  const [lastDayOff, setLastDayOff] = useState(`${new Date().getFullYear()}-12-31`);
  const [bookingEveryone, setBookingEveryone] = useState(false);
  const [bookingScope, setBookingScope] = useState("everyone");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [bankHolidays, setBankHolidays] = useState([]);
  const [loadingBankHolidays, setLoadingBankHolidays] = useState(false);

  useEffect(() => onSnapshot(collection(db, "holidayRequests"), snapshot => {
    const loaded = snapshot.docs.map(request => ({ id: request.id, ...request.data() }));
    setAllRequests(loaded);
    const pending = loaded
      .filter(request => String(request.status || "Pending").toLowerCase() === "pending")
      .sort((a, b) => {
        const first = a.createdAt?.seconds || a.dateOfRequest?.seconds || 0;
        const second = b.createdAt?.seconds || b.dateOfRequest?.seconds || 0;
        return second - first;
      });
    setRequests(pending);
    setLoading(false);
    onCount(pending.length);
  }), [db]);

  useEffect(() => onSnapshot(collection(peopleDb, "users"), snapshot => {
    setEmployees(snapshot.docs.map(person => ({ id: person.id, ...person.data() })).filter(person =>
      person.disabled !== true && person.active !== false && (person.uid || person.id)
    ));
  }), [peopleDb]);

  const administrator = user?.displayName || user?.email || "Administrator";

  async function approve(request) {
    setWorkingId(request.id);
    setMessage("");
    try {
      await updateDoc(doc(db, "holidayRequests", request.id), {
        status: "Approved",
        approvedBy: administrator,
        approvedByUid: user?.uid || "",
        approvedByEmail: user?.email || "",
        approvedAt: serverTimestamp(),
        rejectedBy: "",
        rejectedByUid: "",
        rejectedByEmail: "",
        rejectedAt: null,
        adminComment: "",
      });
      setMessage("Holiday request approved.");
    } catch (error) {
      setMessage(error?.message || "Could not approve this request.");
    } finally {
      setWorkingId("");
    }
  }

  async function reject(request) {
    if (!comment.trim()) {
      setMessage("Add a rejection reason first.");
      return;
    }
    setWorkingId(request.id);
    setMessage("");
    try {
      await updateDoc(doc(db, "holidayRequests", request.id), {
        status: "Rejected",
        rejectedBy: administrator,
        rejectedByUid: user?.uid || "",
        rejectedByEmail: user?.email || "",
        rejectedAt: serverTimestamp(),
        approvedBy: "",
        approvedByUid: "",
        approvedByEmail: "",
        approvedAt: null,
        adminComment: comment.trim(),
      });
      setComment("");
      setRejectingId("");
      setMessage("Holiday request rejected.");
    } catch (error) {
      setMessage(error?.message || "Could not reject this request.");
    } finally {
      setWorkingId("");
    }
  }

  function usePreset(name, start, end = start) {
    setClosureName(name);
    setFirstDayOff(start);
    setLastDayOff(end);
    setBankHolidays([]);
  }

  async function selectUkBankHolidays() {
    setLoadingBankHolidays(true);
    setMessage("");
    try {
      const response = await fetch("https://www.gov.uk/bank-holidays.json");
      if (!response.ok) throw new Error("Could not load GOV.UK bank holidays.");
      const data = await response.json();
      const year = Number(firstDayOff?.slice(0, 4)) || new Date().getFullYear();
      const events = (data["england-and-wales"]?.events || []).filter(event =>
        Number(String(event.date).slice(0, 4)) === year
      );
      if (!events.length) throw new Error(`No published UK bank holidays were found for ${year}.`);
      setClosureName(`UK bank holidays ${year}`);
      setBankHolidays(events);
      setFirstDayOff(events[0].date);
      setLastDayOff(events[events.length - 1].date);
      setMessage(`${events.length} official UK bank-holiday dates selected for ${year}.`);
    } catch (error) {
      setMessage(error?.message || "Could not load UK bank holidays.");
    } finally {
      setLoadingBankHolidays(false);
    }
  }

  function toggleEmployee(uid) {
    setSelectedEmployeeIds(current => current.includes(uid)
      ? current.filter(id => id !== uid)
      : [...current, uid]);
  }

  async function bookEveryoneOff(event) {
    event.preventDefault();
    const periods = bankHolidays.length
      ? bankHolidays.map(holiday => ({ name: holiday.title, startValue: holiday.date, endValue: holiday.date }))
      : [{ name: closureName.trim(), startValue: firstDayOff, endValue: lastDayOff }];
    const start = localDate(firstDayOff);
    const end = localDate(lastDayOff);
    const workingDays = bankHolidays.length
      ? bankHolidays.length
      : countWorkingDays(start, end);
    if (!closureName.trim() || !start || !end || workingDays < 1) {
      setMessage("Choose a valid weekday date range and closure name.");
      return;
    }
    const selectedPeople = bookingScope === "everyone"
      ? employees
      : employees.filter(person => selectedEmployeeIds.includes(person.uid || person.id));
    if (!selectedPeople.length) {
      setMessage(bookingScope === "everyone" ? "No active employee profiles were found." : "Select at least one employee.");
      return;
    }

    const bookings = periods.flatMap(period => {
      const periodStart = localDate(period.startValue);
      const periodEnd = localDate(period.endValue);
      const periodDays = countWorkingDays(periodStart, periodEnd);
      const closureId = `${period.startValue}_${period.endValue}_${period.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const alreadyBooked = new Set(allRequests.filter(request =>
        request.companyClosureId === closureId && String(request.status || "").toLowerCase() !== "rejected"
      ).map(request => request.uid || request.userId));
      return selectedPeople.filter(person => !alreadyBooked.has(person.uid || person.id)).map(person => ({
        person, period, periodStart, periodEnd, periodDays, closureId,
      }));
    });
    if (!bookings.length) {
      setMessage("The selected employees are already booked for these dates. No duplicate deductions were made.");
      return;
    }

    setBookingEveryone(true);
    setMessage("");
    try {
      for (let offset = 0; offset < bookings.length; offset += 450) {
        const batch = writeBatch(db);
        bookings.slice(offset, offset + 450).forEach(({ person, period, periodStart, periodEnd, periodDays, closureId }) => {
          const uid = person.uid || person.id;
          const employeeName = person.displayName || person.name || person.employeeName || person.email || "Employee";
          const requestRef = doc(collection(db, "holidayRequests"));
          batch.set(requestRef, {
            uid,
            userId: uid,
            authProject: "harry-bruce-gaming-ltd",
            destinationProject: "vehicle-check-ebdbf",
            employeeName,
            userName: employeeName,
            userEmail: person.email || person.userEmail || "",
            annualAllowance: Number(person.annualAllowance ?? person.holidayAllowance ?? 28),
            holidayYear: periodStart.getFullYear(),
            dateOfRequest: Timestamp.fromDate(new Date()),
            firstDayOff: Timestamp.fromDate(periodStart),
            lastDayOff: Timestamp.fromDate(periodEnd),
            returnToWorkDate: Timestamp.fromDate(returnToWorkAfter(periodEnd)),
            totalWorkingDaysAbsent: String(periodDays),
            workingDays: periodDays,
            reason: period.name,
            status: "Approved",
            approvedBy: administrator,
            approvedByUid: user?.uid || "",
            approvedByEmail: user?.email || "",
            approvedAt: serverTimestamp(),
            adminComment: `Admin group booking: ${period.name}`,
            companyWide: bookingScope === "everyone",
            companyClosure: true,
            companyClosureId: closureId,
            notificationRead: false,
            pushNotificationPending: true,
            pushNotificationSent: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      const possibleBookings = selectedPeople.length * periods.length;
      const skipped = possibleBookings - bookings.length;
      setMessage(`${selectedPeople.length} employee${selectedPeople.length === 1 ? "" : "s"} booked off. ${workingDays} day${workingDays === 1 ? "" : "s"} deducted from each allowance.${skipped ? ` ${skipped} duplicate booking${skipped === 1 ? " was" : "s were"} skipped.` : ""}`);
    } catch (error) {
      setMessage(error?.message || "Could not book everyone off.");
    } finally {
      setBookingEveryone(false);
    }
  }

  const selectedWorkingDays = bankHolidays.length || countWorkingDays(localDate(firstDayOff), localDate(lastDayOff));
  const selectedYear = Number(firstDayOff?.slice(0, 4)) || new Date().getFullYear();

  return <div className="admin-holidays">
    <div className="admin-section-title"><div><span>Vehicle Check / holidayRequests</span><h2>Holiday approvals</h2><p>Review pending staff requests and record the administrator decision.</p></div><em className={requests.length ? "offline" : "live"}>{requests.length} pending</em></div>
    {message && <div className="admin-action-message">{message}</div>}
    <form className="admin-company-closure" onSubmit={bookEveryoneOff}>
      <header><div><span>Admin holiday booking</span><h3>Book staff off together</h3><p>Book every active employee or select multiple employees. Approved working days are automatically deducted from each allowance.</p></div><b>{employees.length} employees</b></header>
      <div className="admin-closure-presets">
        <button type="button" onClick={() => usePreset("Christmas holiday", `${selectedYear}-12-24`, `${selectedYear}-12-31`)}>Christmas</button>
        <button type="button" onClick={() => usePreset("New Year holiday", `${selectedYear}-12-31`, `${selectedYear + 1}-01-01`)}>New Year</button>
        <button type="button" disabled={loadingBankHolidays} onClick={selectUkBankHolidays}>{loadingBankHolidays ? "Loading GOV.UK dates…" : `Select all UK bank holidays (${selectedYear})`}</button>
      </div>
      {bankHolidays.length > 0 && <div className="admin-bank-holiday-dates">{bankHolidays.map(holiday => <span key={holiday.date}><strong>{holiday.title}</strong>{holidayDate(localDate(holiday.date))}</span>)}</div>}
      <div className="admin-closure-fields">
        <label><span>Holiday name</span><input value={closureName} onChange={event => setClosureName(event.target.value)} placeholder="Christmas shutdown or UK bank holiday" required /></label>
        <label><span>{bankHolidays.length ? "Bank-holiday year starts" : "First day off"}</span><input type="date" value={firstDayOff} onChange={event => { setFirstDayOff(event.target.value); setBankHolidays([]); }} required /></label>
        <label><span>{bankHolidays.length ? "Last selected holiday" : "Last day off"}</span><input type="date" min={firstDayOff} value={lastDayOff} onChange={event => { setLastDayOff(event.target.value); setBankHolidays([]); }} required /></label>
      </div>
      <div className="admin-booking-scope">
        <label><input type="radio" name="bookingScope" checked={bookingScope === "everyone"} onChange={() => setBookingScope("everyone")} /><span><strong>Everyone</strong><small>Book all active employees</small></span></label>
        <label><input type="radio" name="bookingScope" checked={bookingScope === "selected"} onChange={() => setBookingScope("selected")} /><span><strong>Selected employees</strong><small>Choose several people below</small></span></label>
      </div>
      {bookingScope === "selected" && <div className="admin-employee-picker">
        <header><span>{selectedEmployeeIds.length} selected</span><button type="button" onClick={() => setSelectedEmployeeIds(employees.map(person => person.uid || person.id))}>Select all</button><button type="button" onClick={() => setSelectedEmployeeIds([])}>Clear</button></header>
        <div>{employees.map(person => {
          const uid = person.uid || person.id;
          const name = person.displayName || person.name || person.employeeName || person.email || "Employee";
          return <label key={uid}><input type="checkbox" checked={selectedEmployeeIds.includes(uid)} onChange={() => toggleEmployee(uid)} /><span><strong>{name}</strong><small>{person.email || person.userEmail || "No email"}</small></span></label>;
        })}</div>
      </div>}
      <footer><span><strong>{selectedWorkingDays}</strong> day{selectedWorkingDays === 1 ? "" : "s"} deducted per selected employee</span><button disabled={bookingEveryone || selectedWorkingDays < 1 || !employees.length || (bookingScope === "selected" && !selectedEmployeeIds.length)}>{bookingEveryone ? "Saving bookings…" : bookingScope === "everyone" ? "Book everyone off" : `Book ${selectedEmployeeIds.length} employees off`}</button></footer>
    </form>
    {loading ? <div className="admin-holiday-empty">Loading requests…</div> : requests.length === 0 ? <div className="admin-holiday-empty"><i>✓</i><strong>Nothing awaiting approval</strong><span>New requests will appear here automatically.</span></div> : <div className="admin-holiday-list">
      {requests.map(request => {
        const employee = request.employeeName || request.userName || request.displayName || request.name || request.userEmail || "Employee";
        const start = request.firstDayOff || request.startDate;
        const end = request.lastDayOff || request.endDate;
        const days = request.workingDays ?? request.totalDays ?? request.days ?? 0;
        return <article key={request.id}>
          <header><div className="admin-holiday-avatar">{String(employee).charAt(0).toUpperCase()}</div><div><strong>{employee}</strong><span>{request.userEmail || request.email || "No email recorded"}</span></div><b>{days} day{Number(days) === 1 ? "" : "s"}</b></header>
          <div className="admin-holiday-dates"><div><span>First day off</span><strong>{holidayDate(start)}</strong></div><i>→</i><div><span>Last day off</span><strong>{holidayDate(end)}</strong></div></div>
          {request.reason && <p><b>Reason:</b> {request.reason}</p>}
          {rejectingId === request.id && <label className="admin-reject-note"><span>Reason for rejection</span><textarea autoFocus value={comment} onChange={event => setComment(event.target.value)} placeholder="Explain why this request cannot be approved"/></label>}
          <footer>
            {rejectingId === request.id ? <><button className="cancel" onClick={() => { setRejectingId(""); setComment(""); }}>Cancel</button><button className="reject" disabled={workingId === request.id} onClick={() => reject(request)}>Confirm rejection</button></> : <><button className="reject" onClick={() => setRejectingId(request.id)}>Reject</button><button className="approve" disabled={workingId === request.id} onClick={() => approve(request)}>{workingId === request.id ? "Saving…" : "Approve"}</button></>}
          </footer>
        </article>;
      })}
    </div>}
  </div>;
}
