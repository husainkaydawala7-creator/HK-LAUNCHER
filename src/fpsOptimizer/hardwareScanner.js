const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

function execFileText(command, args, timeout = 2500) {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(String(stdout || "").trim());
    });
  });
}

function parseJsonArray(text) {
  try {
    const parsed = JSON.parse(text || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function getGpuInfo() {
  if (process.platform !== "win32") return [];
  const output = await execFileText("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress"
  ]);
  return parseJsonArray(output)
    .map((gpu) => ({
      name: String(gpu.Name || "").trim(),
      vramBytes: Number(gpu.AdapterRAM || 0) > 0 ? Number(gpu.AdapterRAM || 0) : null,
      driverVersion: String(gpu.DriverVersion || "").trim()
    }))
    .filter((gpu) => gpu.name);
}

async function getBatteryInfo() {
  if (process.platform !== "win32") return { state: "unknown", percent: null, label: "Battery status unavailable" };
  const output = await execFileText("powershell.exe", [
    "-NoProfile",
    "-Command",
    "$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1; if ($b) { \"$($b.BatteryStatus)|$($b.EstimatedChargeRemaining)\" }"
  ]);
  if (!output) return { state: "desktop-or-unknown", percent: null, label: "No battery detected or status unavailable" };
  const [statusText, percentText] = output.split("|");
  const status = Number(statusText);
  const percent = Number(percentText);
  const state = status === 1 ? "discharging" : status === 2 ? "plugged-in" : "unknown";
  return {
    state,
    percent: Number.isFinite(percent) ? percent : null,
    label: state === "discharging" ? "Laptop is unplugged" : state === "plugged-in" ? "Laptop is plugged in" : "Battery status unknown"
  };
}

async function getCpuLoadPercent() {
  if (process.platform === "win32") {
    const output = await execFileText("powershell.exe", [
      "-NoProfile",
      "-Command",
      "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"
    ], 1800);
    const value = Math.round(Number(output));
    return Number.isFinite(value) ? value : null;
  }
  const load = os.loadavg()[0];
  const cores = Math.max(1, os.cpus().length || 1);
  const value = Math.round((load / cores) * 100);
  return Number.isFinite(value) ? value : null;
}

async function getStorageInfo(rootDir) {
  try {
    const stats = await fs.statfs(path.parse(rootDir).root || rootDir);
    const storageType = await getStorageType();
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      totalBytes,
      freeBytes,
      usedPercent: totalBytes ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : null,
      type: storageType
    };
  } catch {
    return { totalBytes: null, freeBytes: null, usedPercent: null, type: "unknown" };
  }
}

async function getStorageType() {
  if (process.platform !== "win32") return "unknown";
  const output = await execFileText("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MediaType"
  ], 1800);
  if (/ssd/i.test(output)) return "SSD";
  if (/hdd/i.test(output)) return "HDD";
  return "unknown";
}

function classifyGpu(gpus) {
  const joined = gpus.map((gpu) => gpu.name).join(" ").toLowerCase();
  const maxVramGb = Math.max(0, ...gpus.map((gpu) => Number(gpu.vramBytes || 0) / 1024 / 1024 / 1024));
  if (!joined) return "unknown";
  if (maxVramGb >= 10 || /rtx\s?(40|50)|rx\s?(7|8|9)\d{3}|radeon.*7900/i.test(joined)) return "extreme";
  if (maxVramGb >= 6 || /rtx\s?(20|30)|rx\s?6\d{3}|radeon.*6\d{3}|arc/i.test(joined)) return "dedicated-or-modern";
  if (/rtx|rx\s?[5-9]|radeon.*(6|7)\d{3}|arc/i.test(joined)) return "dedicated-or-modern";
  if (/gtx|mx\d+|radeon|vega/i.test(joined)) return "mid-range";
  if (/intel\(r\)?\s*(uhd|hd)|microsoft basic|basic display|iris/i.test(joined)) return "low-end-or-integrated";
  return "unknown";
}

async function scanHardware({ rootDir, screenInfo = {}, javaInstallations = [] } = {}) {
  const cpus = os.cpus() || [];
  const cpuLoadPercent = await getCpuLoadPercent();
  const gpus = await getGpuInfo();
  const battery = await getBatteryInfo();
  const storage = await getStorageInfo(rootDir || process.cwd());
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const maxVramBytes = Math.max(0, ...gpus.map((gpu) => Number(gpu.vramBytes || 0)));

  return {
    cpu: {
      model: cpus[0]?.model || "Unknown CPU",
      logicalCores: cpus.length || 0,
      threads: cpus.length || 0,
      speedMhz: cpus[0]?.speed || null,
      loadPercent: cpuLoadPercent
    },
    gpu: {
      names: gpus.map((gpu) => gpu.name),
      devices: gpus,
      vramBytes: maxVramBytes || null,
      vramGb: maxVramBytes ? Math.round((maxVramBytes / 1024 / 1024 / 1024) * 10) / 10 : null,
      tier: classifyGpu(gpus)
    },
    memory: {
      totalBytes: totalMemoryBytes,
      freeBytes: freeMemoryBytes,
      totalGb: Math.round((totalMemoryBytes / 1024 / 1024 / 1024) * 10) / 10,
      freeGb: Math.round((freeMemoryBytes / 1024 / 1024 / 1024) * 10) / 10
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch()
    },
    screen: {
      width: screenInfo.width || null,
      height: screenInfo.height || null,
      scaleFactor: screenInfo.scaleFactor || 1,
      refreshRate: screenInfo.refreshRate || screenInfo.displayFrequency || null
    },
    javaInstallations,
    storage,
    battery,
    scannedAt: new Date().toISOString()
  };
}

module.exports = {
  scanHardware
};
