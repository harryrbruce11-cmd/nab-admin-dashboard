# NAB Kiosk remote management

## Firebase configuration

- Required project: `harry-bruce-gaming-ltd`
- Settings: `settings/stores_kiosk`
- Heartbeat: `kiosks/nab-yard-tablet`
- Commands: `kiosks/nab-yard-tablet/commands`
- Callable function: `sendKioskCommand` in `europe-west2`
- Secret: `KIOSK_CONTROL_KEY`

The dashboard and its Firebase Authentication both use `harry-bruce-gaming-ltd`. The callable requires an authenticated token with the custom claim `admin: true`.

## Assign the administrator claim

Run the one-time Admin SDK script from a trusted computer with Application Default Credentials:

```powershell
node functions/set-admin-claim.cjs <approved-user-uid-or-email>
```

The administrator must sign out and back in after the claim changes. Never run this utility from browser code.

## Secret setup and rotation

Set the secret without copying it into source:

```powershell
npx -y firebase-tools@latest functions:secrets:set KIOSK_CONTROL_KEY --data-file "C:\path\to\.kiosk_control_key" --project harry-bruce-gaming-ltd
```

To rotate it, generate a new cryptographically random key, update the trusted kiosk key file and create a new Firebase secret version. Rebuild/restart the tablet as required, then deploy `sendKioskCommand` so it binds to the latest version. The tablet and function must always use the same key.

## Deploy the function

Deployment is deliberately manual:

```powershell
npx -y firebase-tools@latest deploy --only functions:sendKioskCommand --project harry-bruce-gaming-ltd
```

## Sending and auditing commands

Open Admin, select **Kiosk Control**, and use a supported control. The callable validates the administrator, signs the command server-side and writes a pending document. The tablet changes its status to `processing`, `completed`, or `rejected`. The latest 20 commands are visible in the audit list.

The secret and full HMAC signature are never shown by the dashboard.
