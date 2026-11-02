const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const required = [
  "launcher-app/accounts/profiles.json",
  "launcher-app/launch-profiles/profiles.json",
  "launcher-app/settings.json",
  "shared-minecraft/versions",
  "shared-minecraft/libraries",
  "shared-minecraft/assets",
  "shared-minecraft/mods",
  "instances/account-1",
  "instances/account-2",
  "instances/account-3",
  "instances/account-4"
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));

if (missing.length) {
  console.error("Missing launcher paths:");
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Launcher layout looks ready.");
