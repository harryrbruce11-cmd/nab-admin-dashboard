import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { canShowKioskControls, commandValueIsValid, isKioskOnline, isSupportedKioskAction, isValidHttpsUrl, isValidKioskVersion, kioskStatusClass } from "../src/kioskControlUtils.mjs";

const require = createRequire(import.meta.url);
const serverValidation = require("../functions/kioskControl.js");

test("online status expires after 90 seconds", () => {
  const now = Date.now();
  assert.equal(isKioskOnline(new Date(now - 89_000), now), true);
  assert.equal(isKioskOnline(new Date(now - 91_000), now), false);
  assert.equal(isKioskOnline(null, now), false);
});

test("only supported command actions pass client and server validation", () => {
  assert.equal(isSupportedKioskAction("ping"), true);
  assert.equal(serverValidation.isValidAction("show_message"), true);
  assert.equal(serverValidation.isValidAction("shutdown"), false);
});

test("message commands require values", () => {
  assert.equal(commandValueIsValid("show_message", ""), false);
  assert.equal(serverValidation.isValidValue("maintenance_on", ""), false);
  assert.equal(serverValidation.isValidValue("ping", ""), true);
});

test("version and HTTPS URL validation", () => {
  assert.equal(isValidKioskVersion("1.2.3"), true);
  assert.equal(isValidKioskVersion("version 1"), false);
  assert.equal(isValidHttpsUrl("https://example.com/app.apk"), true);
  assert.equal(isValidHttpsUrl("http://example.com/app.apk"), false);
});

test("remote controls are admin-only", () => {
  assert.equal(canShowKioskControls(true), true);
  assert.equal(canShowKioskControls(false), false);
});

test("command statuses render using supported colour classes", () => {
  assert.equal(kioskStatusClass("processing"), "processing");
  assert.equal(kioskStatusClass("completed"), "completed");
  assert.equal(kioskStatusClass("unknown"), "pending");
});
