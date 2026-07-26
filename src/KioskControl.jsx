import { useEffect, useMemo, useState } from "react";
import { getIdTokenResult } from "firebase/auth";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { canShowKioskControls, commandValueIsValid, isKioskOnline, kioskStatusClass } from "./kioskControlUtils.mjs";
import "./kioskControl.css";

const DEVICE_ID = "nab-yard-tablet";

function displayDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-GB") : "..";
}

export default function KioskControl({ db, functions, user }) {
  const [settings, setSettings] = useState({});
  const [heartbeat, setHeartbeat] = useState({});
  const [commands, setCommands] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [claimChecked, setClaimChecked] = useState(false);
  const [submitting, setSubmitting] = useState("");
  const [message, setMessage] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState("The kiosk is temporarily unavailable.");
  const [displayMessage, setDisplayMessage] = useState("");
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    let active = true;
    async function checkClaim() {
      try {
        let result = await getIdTokenResult(user, true);
        if (result.claims.admin !== true && user.uid === "hkWw4SksA8SU8gprMX636aARpcA2" && String(user.email || "").toLowerCase() === "harryrbruce11@gmail.com") {
          const activate = httpsCallable(functions, "activateKioskAdmin");
          await activate();
          await user.getIdToken(true);
          result = await getIdTokenResult(user, true);
        }
        if (active) setIsAdmin(result.claims.admin === true);
      } catch { if (active) setIsAdmin(false); }
      finally { if (active) setClaimChecked(true); }
    }
    checkClaim();
    return () => { active = false; };
  }, [functions, user]);

  useEffect(() => {
    const stopSettings = onSnapshot(doc(db, "settings", "stores_kiosk"), snapshot => setSettings(snapshot.data() || {}));
    const stopHeartbeat = onSnapshot(doc(db, "kiosks", DEVICE_ID), snapshot => setHeartbeat(snapshot.data() || {}));
    const commandQuery = query(collection(db, "kiosks", DEVICE_ID, "commands"), orderBy("createdAt", "desc"), limit(20));
    const stopCommands = onSnapshot(commandQuery, snapshot => setCommands(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))));
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => { stopSettings(); stopHeartbeat(); stopCommands(); clearInterval(timer); };
  }, [db]);

  const remote = settings.remoteManagement || {};
  const online = useMemo(() => isKioskOnline(heartbeat.lastSeen, clock), [heartbeat.lastSeen, clock]);
  const enabled = remote.enabled === true;
  const controlsVisible = canShowKioskControls(isAdmin);

  async function send(action, value = "", confirmation = "") {
    if (confirmation && !window.confirm(confirmation)) return;
    if (!commandValueIsValid(action, value)) { setMessage("Enter a message first."); return; }
    setSubmitting(action);
    setMessage("");
    try {
      const callable = httpsCallable(functions, "sendKioskCommand");
      const result = await callable({ deviceId: DEVICE_ID, action, value: String(value || "").trim() });
      setMessage(`Command ${result.data?.status || "pending"}: ${result.data?.commandId || "sent"}`);
      if (action === "show_message") setDisplayMessage("");
    } catch (error) {
      setMessage(error?.message?.replace("FirebaseError: ", "") || "The command could not be sent.");
    } finally { setSubmitting(""); }
  }

  const disabled = action => submitting || !enabled || (!online && action !== "ping") || !isAdmin;

  return <div className="kiosk-control">
    <div className="admin-section-title"><div><span>kiosks / {DEVICE_ID}</span><h2>Kiosk Control</h2><p>Secure live status and signed remote commands for the NAB yard tablet.</p></div><em className={online ? "live" : "offline"}>{online ? "Online" : "Offline"}</em></div>
    {!claimChecked ? <div className="kiosk-notice">Checking administrator permissions…</div> : !controlsVisible && <div className="kiosk-notice danger"><strong>Administrator claim required.</strong> Your signed-in Firebase account does not have <code>admin: true</code>. Status remains visible, but remote controls are hidden.</div>}
    {message && <div className="kiosk-notice">{message}</div>}
    <section className="kiosk-status-grid">
      <div><span>Last seen</span><strong>{displayDate(heartbeat.lastSeen)}</strong></div><div><span>Installed version</span><strong>{heartbeat.installedVersion || heartbeat.version || ".."}</strong></div><div><span>Build number</span><strong>{heartbeat.buildNumber || ".."}</strong></div><div><span>Platform</span><strong>{heartbeat.platform || ".."}</strong></div><div><span>Remote control</span><strong>{enabled ? "Enabled" : "Disabled"}</strong></div><div><span>Control-key fingerprint</span><strong>{heartbeat.controlKeyFingerprint || heartbeat.keyFingerprint || ".."}</strong></div><div><span>Firebase UID</span><strong>{heartbeat.firebaseUid || heartbeat.authUid || ".."}</strong></div><div><span>Heartbeat interval</span><strong>{remote.heartbeatSeconds || ".."} seconds</strong></div>
    </section>
    {controlsVisible && <section className="kiosk-controls">
      <header><h3>Remote controls</h3><span>{enabled ? "Signed commands enabled" : "Disabled in kiosk settings"}</span></header>
      <div className="kiosk-quick-controls"><button disabled={disabled("ping")} onClick={() => send("ping")}>Test connection</button><button disabled={disabled("reload")} onClick={() => send("reload")}>Reload settings</button><button disabled={disabled("check_update")} onClick={() => send("check_update", "", "Ask the kiosk to check for and install an available update?")}>Check for update</button><button className="end" disabled={disabled("maintenance_off")} onClick={() => send("maintenance_off")}>End maintenance</button></div>
      <div className="kiosk-message-controls"><label><span>Maintenance message</span><textarea value={maintenanceMessage} onChange={event => setMaintenanceMessage(event.target.value)}/><button disabled={disabled("maintenance_on") || !maintenanceMessage.trim()} onClick={() => send("maintenance_on", maintenanceMessage, "Put the kiosk into maintenance mode?")}>Start maintenance</button></label><label><span>Display a message</span><textarea value={displayMessage} onChange={event => setDisplayMessage(event.target.value)} placeholder="Message shown on the tablet"/><button disabled={disabled("show_message") || !displayMessage.trim()} onClick={() => send("show_message", displayMessage)}>Display message</button></label></div>
    </section>}
    <section className="kiosk-history"><header><h3>Command history</h3><span>Latest 20 commands</span></header>{commands.length ? <div>{commands.map(command => <article key={command.id}><header><strong>{String(command.action || "command").replaceAll("_", " ")}</strong><b className={kioskStatusClass(command.status)}>{command.status || "pending"}</b></header>{command.value && <p>{command.value}</p>}<dl><div><dt>Created</dt><dd>{displayDate(command.createdAt)}</dd></div><div><dt>Started</dt><dd>{displayDate(command.startedAt)}</dd></div><div><dt>Completed</dt><dd>{displayDate(command.completedAt)}</dd></div></dl>{command.error && <footer>{command.error}</footer>}</article>)}</div> : <div className="kiosk-empty">No kiosk commands have been recorded.</div>}</section>
  </div>;
}
