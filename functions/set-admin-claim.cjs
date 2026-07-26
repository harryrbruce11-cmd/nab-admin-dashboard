/* One-time local Admin SDK utility. Never bundle this file into the client. */
const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const identifier = String(process.argv[2] || "").trim();
if (!identifier) {
  console.error("Usage: node functions/set-admin-claim.cjs <firebase-uid-or-email>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: "harry-bruce-gaming-ltd" });

(async () => {
  const account = identifier.includes("@") ? await getAuth().getUserByEmail(identifier) : await getAuth().getUser(identifier);
  await getAuth().setCustomUserClaims(account.uid, { ...(account.customClaims || {}), admin: true });
  console.log(`Admin claim assigned to Firebase UID ${account.uid}. Sign out and back in to refresh the token.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
