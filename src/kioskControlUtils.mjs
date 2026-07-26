export const KIOSK_ACTIONS = ["ping", "reload", "check_update", "maintenance_on", "maintenance_off", "show_message"];

export function isKioskOnline(lastSeen, now = Date.now(), thresholdSeconds = 90) {
  const date = lastSeen?.toDate ? lastSeen.toDate() : lastSeen instanceof Date ? lastSeen : lastSeen ? new Date(lastSeen) : null;
  return Boolean(date && !Number.isNaN(date.getTime()) && now - date.getTime() <= thresholdSeconds * 1000);
}

export function isSupportedKioskAction(action) {
  return KIOSK_ACTIONS.includes(String(action || ""));
}

export function commandValueIsValid(action, value) {
  const text = String(value || "").trim();
  return !["maintenance_on", "show_message"].includes(action) || text.length > 0;
}

export function isValidKioskVersion(value) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(value || "").trim());
}

export function isValidHttpsUrl(value) {
  try { return new URL(String(value || "")).protocol === "https:"; } catch { return false; }
}

export function isValidHexColour(value, allowEmpty = false) {
  const text = String(value || "").trim();
  return (allowEmpty && !text) || /^#[0-9a-fA-F]{6}$/.test(text);
}

export function canShowKioskControls(isAdministrator) {
  return isAdministrator === true;
}

export function kioskStatusClass(status) {
  const normalised = String(status || "pending").toLowerCase();
  return ["pending", "processing", "completed", "rejected"].includes(normalised) ? normalised : "pending";
}
