import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import KioskControl from "./KioskControl";
import HolidayCalendar from "./holidays/HolidayCalendar";
import { isValidHexColour, isValidHttpsUrl, isValidKioskVersion } from "./kioskControlUtils.mjs";
import "./adminScreen.css";

const ADMIN_SESSION_KEY = "nab-admin-dashboard:admin-unlocked";

const defaultTools = [
  ["kiosk", "Kiosk editor", "Change kiosk messages, availability and display settings.", "screen"],
  ["updates", "App updates", "Check versions and manage application releases.", "refresh"],
  ["holidays", "Holiday approvals", "Approve or reject pending staff holiday requests.", "calendar"],
  ["invoices", "Invoices", "Review draft and generated customer invoices.", "invoice"],
  ["customers", "Customers", "Maintain saved customer names and addresses.", "users"],
  ["machines", "Machines", "Maintain machine size, type and serial numbers.", "machine"],
  ["system", "System tools", "Reserved for additional administrative tools.", "settings"],
];

function AdminToolIcon({ name }) {
  const paths = {
    screen: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    vehicle: <><path d="m5 17-2-2v-4l2-5h14l2 5v4l-2 2"/><path d="M5 11h14M7 17v2M17 17v2"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></>,
    refresh: <><path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 1 8"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
    users: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 14a7 7 0 0 1 4 7"/></>,
    machine: <><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V4h10v3M8 12h8M8 15h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

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
    buttonBackgroundColor: "#000000",
    buttonTextColor: "#ffffff",
    buttonText: "Tap Here To Order Parts",
    enabled: true,
    fullScreenTap: false,
    hideButton: false,
    hideLogo: false,
    hideSubtitle: true,
    hideTitle: true,
    hintText: "Tap here to begin",
    welcomeImageUrl: "",
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
  const [previewNow, setPreviewNow] = useState(() => new Date());

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

  useEffect(() => {
    const timer = window.setInterval(() => setPreviewNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
      if (!isValidHexColour(kiosk.backgroundColorTop) || !isValidHexColour(kiosk.backgroundColorBottom) || !isValidHexColour(kiosk.buttonBackgroundColor) || !isValidHexColour(kiosk.buttonTextColor) || !isValidHexColour(kiosk.textColor, true)) throw new Error("Colours must use six-digit hexadecimal values, for example #0ea5e9.");
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

  function updateKioskColour(field, event) {
    const value = event.currentTarget.value;
    setKiosk(current => field === "buttonBackgroundColor"
      ? { ...current, buttonBackgroundColor: value, backgroundColorTop: value }
      : { ...current, [field]: value });
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
          <i><AdminToolIcon name={icon}/></i><span><strong>{title}</strong><small>{description}</small></span>{counts[id] !== undefined && <b>{counts[id]}</b>}
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
            <label className="full"><span>Welcome image URL</span><input value={kiosk.welcomeImageUrl || ""} onChange={event => setKiosk({...kiosk, welcomeImageUrl: event.target.value})} placeholder="Paste the main kiosk welcome image URL"/></label>
            <div className="admin-logo-builder full">
              <header><div><span>Logo images</span><small>Drag images to change their display order. The first image remains the primary kiosk logo.</small></div><label className="admin-logo-picker"><input type="file" accept="image/*" multiple onChange={pickLogoFiles}/>{uploadingLogo ? "Uploading…" : "Pick images"}</label></header>
              <div className="admin-logo-url-row"><input value={logoUrlDraft} onChange={event => setLogoUrlDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addLogoUrl(); } }} placeholder="Paste another image URL"/><button type="button" onClick={addLogoUrl}>Add URL</button></div>
              {kiosk.logoUrls?.length ? <div className="admin-logo-list">{kiosk.logoUrls.map((url, index) => <article key={`${url}-${index}`} draggable onDragStart={() => setDraggedLogo(index)} onDragOver={event => event.preventDefault()} onDrop={() => moveLogo(draggedLogo, index)} onDragEnd={() => setDraggedLogo(-1)} className={draggedLogo === index ? "dragging" : ""}>
                <img src={url} alt={`Kiosk logo ${index + 1}`}/><div><strong>{index === 0 ? "Primary logo" : `Image ${index + 1}`}</strong><small>{url}</small></div><button type="button" title="Move left" disabled={index === 0} onClick={() => moveLogo(index, index - 1)}>←</button><button type="button" title="Move right" disabled={index === kiosk.logoUrls.length - 1} onClick={() => moveLogo(index, index + 1)}>→</button><button type="button" className="remove" onClick={() => setKiosk(current => { const logoUrls = current.logoUrls.filter((_, itemIndex) => itemIndex !== index); return {...current, logoUrls, logoUrl: logoUrls[0] || ""}; })}>Remove</button>
              </article>)}</div> : <div className="admin-logo-empty">No logo images added yet.</div>}
            </div>
            <label className="full"><span>APK URL</span><input value={kiosk.apkUrl || ""} onChange={event => setKiosk({...kiosk, apkUrl: event.target.value})}/></label>
             <label className="admin-colour"><span>Button colour</span><div><input aria-label="Pick button colour" type="color" value={kiosk.buttonBackgroundColor || kiosk.backgroundColorTop || "#000000"} onChange={event => updateKioskColour("buttonBackgroundColor", event)}/><input value={kiosk.buttonBackgroundColor || kiosk.backgroundColorTop || "#000000"} onChange={event => { const value = event.target.value; setKiosk({...kiosk, buttonBackgroundColor: value, backgroundColorTop: value}); }} placeholder="#000000"/></div></label>
             <label className="admin-colour"><span>Page background bottom</span><div><input aria-label="Pick page background bottom colour" type="color" value={kiosk.backgroundColorBottom || "#020617"} onInput={event => updateKioskColour("backgroundColorBottom", event)}/><input value={kiosk.backgroundColorBottom || ""} onChange={event => setKiosk({...kiosk, backgroundColorBottom: event.target.value})} placeholder="#020617"/></div></label>
             <label className="admin-colour"><span>Button text colour</span><div><input aria-label="Pick button text colour" type="color" value={kiosk.buttonTextColor || "#ffffff"} onInput={event => updateKioskColour("buttonTextColor", event)}/><input value={kiosk.buttonTextColor || ""} onChange={event => setKiosk({...kiosk, buttonTextColor: event.target.value})} placeholder="#ffffff"/></div></label>
             <label className="admin-colour full"><span>Page text colour (optional)</span><div><input aria-label="Pick page text colour" type="color" value={kiosk.textColor || "#ffffff"} onInput={event => updateKioskColour("textColor", event)}/><input value={kiosk.textColor || ""} onChange={event => setKiosk({...kiosk, textColor: event.target.value})} placeholder="Use kiosk default"/></div></label>
            <div className="admin-kiosk-preview-wrap full">
              <div className="admin-preview-label"><span>Live kiosk preview</span><small>Updates as you type</small></div>
              <div className="admin-kiosk-preview" style={{ "--preview-top": kiosk.backgroundColorTop || "#0ea5e9", "--preview-bottom": kiosk.backgroundColorBottom || kiosk.backgroundColorTop || "#0ea5e9", "--preview-text": kiosk.textColor || "#ffffff", "--preview-button": kiosk.buttonBackgroundColor || "#000000", "--preview-button-text": kiosk.buttonTextColor || "#ffffff" }}>
                <div className="admin-kiosk-preview-main">
                  <header>{!kiosk.hideTitle && <strong>{kiosk.title || "Welcome To NAB Kiosk"}</strong>}<div className="admin-preview-clock"><div><b>{String(previewNow.getHours()).padStart(2, "0")}</b><i>:</i><b>{String(previewNow.getMinutes()).padStart(2, "0")}</b></div><span>{previewNow.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span></div></header>
                  {!kiosk.hideLogo && <div className="admin-preview-welcome-image">{/^https:\/\//i.test(String(kiosk.welcomeImageUrl || kiosk.logoUrls?.[0] || "")) ? <img src={kiosk.welcomeImageUrl || kiosk.logoUrls[0]} alt="Kiosk welcome"/> : <div><span>▧</span><strong>Add a valid HTTPS welcome image URL</strong></div>}</div>}
                  <p>{kiosk.hintText || "How would you like to continue?"}</p>
                </div>
                <footer>{!kiosk.hideButton && <button type="button">☝ <span>{kiosk.buttonText || "Tap Here to Order Parts"}</span></button>} {!kiosk.hideSubtitle && <small>© {kiosk.subtitle || "NAB Kiosk is protected by UK copyright law."}</small>}</footer>
              </div>
            </div>
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
        {["invoices", "customers", "machines", "system"].includes(activeTool) && <div className="admin-placeholder"><i><AdminToolIcon name={tools.find(tool => tool[0] === activeTool)?.[3]}/></i><span>Admin module</span><h2>{tools.find(tool => tool[0] === activeTool)?.[1]}</h2><p>{tools.find(tool => tool[0] === activeTool)?.[2]}</p><strong>{counts[activeTool] !== undefined ? `${counts[activeTool]} records available` : "Ready for your next admin tool"}</strong></div>}
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

function holidayDateObject(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? new Date(value) : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  date.setHours(12, 0, 0, 0);
  return date;
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

function approvedDaysForEmployee(requests, uid, year = new Date().getFullYear()) {
  return requests.filter(request => {
    const requestUid = request.uid || request.userId;
    const requestDate = holidayDateObject(request.firstDayOff || request.startDate);
    const requestYear = Number(request.holidayYear) || requestDate?.getFullYear();
    return String(requestUid || "") === String(uid) && String(request.status || "").toLowerCase() === "approved" && requestYear === year;
  }).reduce((total, request) => total + Number(request.workingDays ?? request.totalWorkingDaysAbsent ?? request.totalDays ?? request.days ?? 0), 0);
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
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [allowanceDrafts, setAllowanceDrafts] = useState({});
  const [totalAllowanceDrafts, setTotalAllowanceDrafts] = useState({});
  const [savingAllowanceId, setSavingAllowanceId] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [removingEmployeeId, setRemovingEmployeeId] = useState("");
  const [newEmployee, setNewEmployee] = useState({ name: "", email: "", allowance: 28, daysLeft: 28 });

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

  async function removeHoliday(request, selectedDate) {
    const employee = request.employeeName || request.userName || request.displayName || request.name || "this employee";
    const selected = holidayDateObject(selectedDate);
    const start = holidayDateObject(request.firstDayOff || request.startDate);
    const end = holidayDateObject(request.lastDayOff || request.endDate);
    if (!selected || !start || !end || selected < start || selected > end) {
      setMessage("Could not identify the selected holiday date.");
      return;
    }
    const restoredDays = selected.getDay() === 0 || selected.getDay() === 6 ? 0 : 1;
    if (!window.confirm(`Remove ${holidayDate(selected)} from ${employee}'s holiday?${restoredDays ? " One day will become available again." : " This is a weekend, so the allowance will not change."}`)) return;
    setWorkingId(request.id);
    setMessage("");
    try {
      if (start.getTime() === end.getTime()) {
        await deleteDoc(doc(db, "holidayRequests", request.id));
      } else {
        const dayBefore = new Date(selected);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const dayAfter = new Date(selected);
        dayAfter.setDate(dayAfter.getDate() + 1);
        const segments = [];
        if (start <= dayBefore) segments.push({ start, end: dayBefore });
        if (dayAfter <= end) segments.push({ start: dayAfter, end });
        const { id: _requestId, ...requestData } = request;
        const batch = writeBatch(db);
        batch.delete(doc(db, "holidayRequests", request.id));
        segments.forEach(segment => {
          const workingDays = countWorkingDays(segment.start, segment.end);
          batch.set(doc(collection(db, "holidayRequests")), {
            ...requestData,
            firstDayOff: Timestamp.fromDate(segment.start),
            startDate: Timestamp.fromDate(segment.start),
            lastDayOff: Timestamp.fromDate(segment.end),
            endDate: Timestamp.fromDate(segment.end),
            returnToWorkDate: Timestamp.fromDate(returnToWorkAfter(segment.end)),
            workingDays,
            totalWorkingDaysAbsent: String(workingDays),
            updatedAt: serverTimestamp(),
            adjustedBy: administrator,
            adjustedByUid: user?.uid || "",
          });
        });
        await batch.commit();
      }
      setMessage(`${holidayDate(selected)} was removed from ${employee}'s holiday.${restoredDays ? " One day is now available again." : " Their allowance is unchanged."}`);
    } catch (error) {
      setMessage(error?.message || "Could not remove this holiday day.");
    } finally {
      setWorkingId("");
    }
  }

  async function saveTotalAllowance(person) {
    const uid = person.uid || person.id;
    const usedDays = approvedDaysForEmployee(allRequests, uid);
    const previousAllowance = Number(person.annualAllowance ?? person.holidayAllowance ?? 28);
    const savedDaysLeft = Number(person.holidayDaysLeft);
    const unchangedDaysLeft = Number.isFinite(savedDaysLeft) ? Math.max(savedDaysLeft, 0) : Math.max(previousAllowance - usedDays, 0);
    const totalAllowance = Number(totalAllowanceDrafts[uid] ?? person.annualAllowance ?? person.holidayAllowance ?? 28);
    if (!Number.isFinite(totalAllowance) || totalAllowance < usedDays) {
      setMessage(`Total allowance cannot be lower than the ${usedDays} days already used.`);
      return;
    }
    setSavingAllowanceId(uid);
    setMessage("");
    try {
      await setDoc(doc(peopleDb, "users", uid), {
        annualAllowance: totalAllowance,
        holidayAllowance: totalAllowance,
        holidayDaysLeft: unchangedDaysLeft,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setAllowanceDrafts(current => ({ ...current, [uid]: unchangedDaysLeft }));
      setTotalAllowanceDrafts(current => ({ ...current, [uid]: totalAllowance }));
      setMessage(`${person.displayName || person.name || person.employeeName || "Employee"}'s holiday allowance is now ${totalAllowance} days.`);
    } catch (error) {
      setMessage(error?.message || "Could not update this employee's allowance.");
    } finally {
      setSavingAllowanceId("");
    }
  }

  async function saveDaysLeft(person) {
    const uid = person.uid || person.id;
    const usedDays = approvedDaysForEmployee(allRequests, uid);
    const currentAllowance = Number(person.annualAllowance ?? person.holidayAllowance ?? 28);
    const daysLeft = Number(allowanceDrafts[uid] ?? Math.max(currentAllowance - usedDays, 0));
    if (!Number.isFinite(daysLeft) || daysLeft < 0) {
      setMessage("Enter a valid number of days left of zero or more.");
      return;
    }
    setSavingAllowanceId(uid);
    setMessage("");
    try {
      await setDoc(doc(peopleDb, "users", uid), {
        holidayDaysLeft: daysLeft,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage(`${person.displayName || person.name || person.employeeName || "Employee"} now has ${daysLeft} days left.`);
    } catch (error) {
      setMessage(error?.message || "Could not update the days left.");
    } finally {
      setSavingAllowanceId("");
    }
  }

  async function addEmployee(event) {
    event.preventDefault();
    const name = newEmployee.name.trim();
    const email = newEmployee.email.trim().toLowerCase();
    const allowance = Number(newEmployee.allowance);
    const daysLeft = Number(newEmployee.daysLeft);
    if (!name || !Number.isFinite(allowance) || allowance < 0 || !Number.isFinite(daysLeft) || daysLeft < 0) {
      setMessage("Enter a name and valid allowance values.");
      return;
    }
    if (email && employees.some(person => String(person.email || person.userEmail || "").toLowerCase() === email)) {
      setMessage("An employee with this email already exists.");
      return;
    }
    setAddingEmployee(true);
    setMessage("");
    try {
      const employeeRef = doc(collection(peopleDb, "users"));
      await setDoc(employeeRef, {
        uid: employeeRef.id,
        displayName: name,
        name,
        email,
        annualAllowance: allowance,
        holidayAllowance: allowance,
        holidayDaysLeft: daysLeft,
        active: true,
        createdByAdmin: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewEmployee({ name: "", email: "", allowance: 28, daysLeft: 28 });
      setShowAddEmployee(false);
      setMessage(`${name} was added to Holiday allowances.`);
    } catch (error) {
      setMessage(error?.message || "Could not add the employee.");
    } finally {
      setAddingEmployee(false);
    }
  }

  async function removeEmployee(person) {
    const profileId = person.id;
    const name = person.displayName || person.name || person.employeeName || "this employee";
    if (!profileId || String(person.uid || profileId) === String(user?.uid || "")) {
      setMessage("The currently signed-in administrator cannot be removed here.");
      return;
    }
    if (!window.confirm(`Remove ${name} from Holiday allowances? Their existing holiday history will be kept.`)) return;
    setRemovingEmployeeId(profileId);
    setMessage("");
    try {
      await deleteDoc(doc(peopleDb, "users", profileId));
      setSelectedEmployeeIds(current => current.filter(id => id !== (person.uid || profileId)));
      setMessage(`${name} was removed from Holiday allowances. Their existing holiday history was kept.`);
    } catch (error) {
      setMessage(error?.message || "Could not remove the employee.");
    } finally {
      setRemovingEmployeeId("");
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
    <section className="admin-allowance-editor">
      <header><div><span>Employee settings</span><h3>Holiday allowances</h3><p>Add employees and edit their holiday allowance or days left.</p></div><div className="admin-allowance-heading-actions"><b>{employees.length} employees</b><button type="button" onClick={() => setShowAddEmployee(value => !value)}>{showAddEmployee ? "Cancel" : "+ Add employee"}</button></div></header>
      {showAddEmployee && <form className="admin-add-employee" onSubmit={addEmployee}>
        <label><span>Employee name</span><input required value={newEmployee.name} onChange={event => setNewEmployee(current => ({ ...current, name: event.target.value }))} placeholder="Full name"/></label>
        <label><span>Email (optional)</span><input type="email" value={newEmployee.email} onChange={event => setNewEmployee(current => ({ ...current, email: event.target.value }))} placeholder="name@company.com"/></label>
        <label><span>Holiday allowance</span><input type="number" min="0" step="0.5" value={newEmployee.allowance} onChange={event => setNewEmployee(current => ({ ...current, allowance: event.target.value }))}/></label>
        <label><span>Days left</span><input type="number" min="0" step="0.5" value={newEmployee.daysLeft} onChange={event => setNewEmployee(current => ({ ...current, daysLeft: event.target.value }))}/></label>
        <button disabled={addingEmployee}>{addingEmployee ? "Adding…" : "Add employee"}</button>
      </form>}
      <div>{employees.map(person => {
        const uid = person.uid || person.id;
        const name = person.displayName || person.name || person.employeeName || person.email || "Employee";
        const allowance = person.annualAllowance ?? person.holidayAllowance ?? 28;
        const usedDays = approvedDaysForEmployee(allRequests, uid);
        const savedDaysLeft = Number(person.holidayDaysLeft);
        const daysLeft = Number.isFinite(savedDaysLeft) ? Math.max(savedDaysLeft, 0) : Math.max(Number(allowance) - usedDays, 0);
        return <article key={uid}>
          <span className="admin-holiday-avatar">{String(name).charAt(0).toUpperCase()}</span>
          <div className="admin-allowance-person"><strong>{name}</strong><small>{usedDays} days used this year</small></div>
          <label className="admin-total-allowance"><span>Holiday allowance</span><input type="number" min={usedDays} step="0.5" value={totalAllowanceDrafts[uid] ?? allowance} onChange={event => setTotalAllowanceDrafts(current => ({ ...current, [uid]: event.target.value }))}/></label>
          <button type="button" className="admin-save-total" disabled={savingAllowanceId === uid} onClick={() => saveTotalAllowance(person)}>{savingAllowanceId === uid ? "Saving…" : "Save holiday allowance"}</button>
          <div className="admin-days-left-control"><span>Days left</span><div><button type="button" aria-label={`Remove half a day from ${name}`} onClick={() => setAllowanceDrafts(current => ({ ...current, [uid]: Math.max(Number(current[uid] ?? daysLeft) - 0.5, 0) }))}>−½</button><input type="number" min="0" step="0.5" value={allowanceDrafts[uid] ?? daysLeft} onChange={event => setAllowanceDrafts(current => ({ ...current, [uid]: event.target.value }))}/><button type="button" aria-label={`Add half a day to ${name}`} onClick={() => setAllowanceDrafts(current => ({ ...current, [uid]: Number(current[uid] ?? daysLeft) + 0.5 }))}>+½</button></div></div>
          <button type="button" disabled={savingAllowanceId === uid} onClick={() => saveDaysLeft(person)}>{savingAllowanceId === uid ? "Saving…" : "Save days left"}</button>
          <button type="button" className="admin-remove-employee" disabled={removingEmployeeId === person.id || String(uid) === String(user?.uid || "")} onClick={() => removeEmployee(person)}>{removingEmployeeId === person.id ? "Removing…" : "Remove employee"}</button>
        </article>;
      })}</div>
    </section>
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
      <div className="admin-employee-picker">
        <header><label><span>⌕</span><input value={employeeSearch} onChange={event => setEmployeeSearch(event.target.value)} placeholder="Search users by name or email"/></label><em>{bookingScope === "everyone" ? employees.length : selectedEmployeeIds.length} selected</em><button type="button" onClick={() => { setBookingScope("selected"); setSelectedEmployeeIds(employees.map(person => person.uid || person.id)); }}>Select all</button><button type="button" onClick={() => { setBookingScope("selected"); setSelectedEmployeeIds([]); }}>Clear</button></header>
        <div>{employees.filter(person => `${person.displayName || ""} ${person.name || ""} ${person.employeeName || ""} ${person.firstName || ""} ${person.lastName || ""} ${person.email || ""} ${person.userEmail || ""}`.toLowerCase().includes(employeeSearch.trim().toLowerCase())).map(person => {
          const uid = person.uid || person.id;
          const name = person.displayName || person.name || person.employeeName || [person.firstName, person.lastName].filter(Boolean).join(" ") || "Unnamed user";
          const selected = bookingScope === "everyone" || selectedEmployeeIds.includes(uid);
          return <label className={selected ? "selected" : ""} key={uid}><input type="checkbox" checked={selected} onChange={() => { if (bookingScope === "everyone") { setBookingScope("selected"); setSelectedEmployeeIds(employees.map(item => item.uid || item.id).filter(id => id !== uid)); } else toggleEmployee(uid); }} /><strong>{name}</strong></label>;
        })}</div>
      </div>
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
    <section className="admin-booked-calendar">
      <HolidayCalendar requests={allRequests.map(request => ({ ...request, startDate: request.firstDayOff || request.startDate, endDate: request.lastDayOff || request.endDate }))} onRemove={removeHoliday}/>
    </section>
  </div>;
}
