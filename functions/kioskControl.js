const DEVICE_ID = "nab-yard-tablet";
const ACTIONS = Object.freeze(["ping", "reload", "check_update", "maintenance_on", "maintenance_off", "show_message"]);
const VALUE_REQUIRED = Object.freeze(["maintenance_on", "show_message"]);

function isValidDeviceId(deviceId) { return deviceId === DEVICE_ID; }
function isValidAction(action) { return ACTIONS.includes(action); }
function isValidValue(action, value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= 1000 && (!VALUE_REQUIRED.includes(action) || text.length > 0);
}

module.exports = { DEVICE_ID, ACTIONS, VALUE_REQUIRED, isValidDeviceId, isValidAction, isValidValue };
