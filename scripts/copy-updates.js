const fs = require("fs");
const path = require("path");

const root = process.cwd();
const distElectronDir = path.join(root, "dist-electron");
const updatesDir = path.join(distElectronDir, "updates");

if (!fs.existsSync(distElectronDir)) {
  console.error("❌ dist-electron folder not found. Run electron-builder first.");
  process.exit(1);
}

fs.mkdirSync(updatesDir, { recursive: true });

const files = fs.readdirSync(distElectronDir).filter((file) => {
  return (
    file.endsWith(".yml") ||
    file.endsWith(".exe") ||
    file.endsWith(".blockmap") ||
    file.endsWith(".dmg") ||
    file.endsWith(".zip")
  );
});

if (files.length === 0) {
  console.error("❌ No update files found in dist-electron.");
  process.exit(1);
}

for (const file of files) {
  const from = path.join(distElectronDir, file);
  const to = path.join(updatesDir, file);

  if (from === to) continue;

  fs.copyFileSync(from, to);
  console.log(`✅ Copied ${file} -> dist-electron/updates/${file}`);
}

// Add simple Firebase Hosting homepage so root URL does not show "Page Not Found"
const indexPath = path.join(distElectronDir, "index.html");
const indexHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>NAB Admin Updates</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #0f172a;
        color: white;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
      }
      .card {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 22px;
        padding: 28px;
        max-width: 520px;
        text-align: center;
      }
      a { color: #facc15; font-weight: 800; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>NAB Admin Updates</h1>
      <p>This Firebase Hosting site is used for Electron auto updates.</p>
      <p><a href="/updates/latest.yml">View latest update feed</a></p>
    </div>
  </body>
</html>
`;

fs.writeFileSync(indexPath, indexHtml.trim(), "utf8");
console.log("✅ Created dist-electron/index.html");

console.log("✅ Firebase update feed is ready.");