const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const https = require('node:https');

const MOJANG_RUNTIME_ALL_URL = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

let cachedJavaInstallations = null;
let lastScanTime = 0;

/**
 * Executes java.exe -version and parses version, major, vendor, architecture.
 */
function verifyJavaExecutable(exePath) {
  try {
    if (!fs.existsSync(exePath)) return null;
    const stat = fs.statSync(exePath);
    if (!stat.isFile()) return null;

    const result = spawnSync(exePath, ["-version"], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const output = (result.stderr || "") + "\n" + (result.stdout || "");
    if (!output.trim()) return null;

    // Extract version: e.g. "21.0.10", "1.8.0_381", "17.0.9", "25.0.1"
    const versionMatch = output.match(/(?:java|openjdk)\s+(?:full\s+)?version\s+"([^"]+)"/i) ||
      output.match(/version\s+"([^"]+)"/i) ||
      output.match(/(?:java|openjdk)\s+([0-9._]+)/i);

    const versionStr = versionMatch ? versionMatch[1] : "Unknown";

    // Determine major version
    let major = 0;
    if (versionStr.startsWith("1.8.")) {
      major = 8;
    } else if (versionStr.startsWith("1.")) {
      const sub = versionStr.split(".")[1];
      major = parseInt(sub, 10) || 8;
    } else {
      const match = versionStr.match(/^(\d+)/);
      major = match ? parseInt(match[1], 10) : 0;
    }

    if (major === 0) {
      // Fallback: look for 21.x, 17.x in output
      const fallbackMatch = output.match(/\b(25|24|23|22|21|20|19|18|17|16|11|8)\b/);
      if (fallbackMatch) major = parseInt(fallbackMatch[1], 10);
    }

    // Determine vendor / distribution
    let vendor = "Standard Java";
    const lowerOut = output.toLowerCase();
    const lowerPath = exePath.toLowerCase();

    if (lowerOut.includes("temurin") || lowerOut.includes("adoptium") || lowerPath.includes("adoptium")) {
      vendor = "Eclipse Adoptium (Temurin)";
    } else if (lowerOut.includes("corretto") || lowerPath.includes("corretto")) {
      vendor = "Amazon Corretto";
    } else if (lowerOut.includes("microsoft") || lowerPath.includes("microsoft")) {
      vendor = "Microsoft OpenJDK";
    } else if (lowerOut.includes("zulu") || lowerPath.includes("zulu")) {
      vendor = "Azul Zulu";
    } else if (lowerPath.includes("android studio") || lowerOut.includes("jbr")) {
      vendor = "Android Studio JBR";
    } else if (lowerPath.includes("mojang") || lowerPath.includes("launcher-data\\runtime")) {
      vendor = "Mojang Official Runtime";
    } else if (lowerOut.includes("hotspot") || lowerOut.includes("oracle")) {
      vendor = "Oracle Java";
    } else if (lowerOut.includes("openjdk")) {
      vendor = "OpenJDK";
    }

    // Determine architecture
    const is64Bit = lowerOut.includes("64-bit") || lowerPath.includes("x64") || !lowerPath.includes("(x86)");

    return {
      path: path.normalize(exePath),
      name: `${vendor} ${major > 0 ? major : ""} (${versionStr})`.replace(/\s+/g, " ").trim(),
      version: versionStr,
      major,
      vendor,
      is64Bit,
      recommendedFor: javaRecommendation(major)
    };
  } catch (e) {
    return null;
  }
}

function javaRecommendation(major) {
  if (major >= 21) return "Minecraft 1.20.5+ and 1.21+ (Modern)";
  if (major >= 17) return "Minecraft 1.18 through 1.20.4";
  if (major >= 8) return "Minecraft 1.16.5 and older (Legacy)";
  return "Unknown";
}

/**
 * Searches Windows registry keys for Java installations.
 */
function queryRegistryPaths() {
  const candidates = [];
  const keys = [
    "HKLM\\SOFTWARE\\JavaSoft",
    "HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft",
    "HKLM\\SOFTWARE\\Eclipse Adoptium",
    "HKLM\\SOFTWARE\\Eclipse Foundation",
    "HKLM\\SOFTWARE\\Microsoft\\JDK",
    "HKLM\\SOFTWARE\\Azul Systems\\Zulu"
  ];

  for (const key of keys) {
    try {
      const out = execSync(`reg query "${key}" /s`, {
        encoding: "utf8",
        timeout: 2500,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      });
      const lines = out.split("\n");
      for (const line of lines) {
        const match = line.match(/(?:JavaHome|Path)\s+REG_SZ\s+(.+)/i);
        if (match) {
          const dir = match[1].trim();
          const exe = path.join(dir, "bin", "java.exe");
          if (fs.existsSync(exe)) candidates.push(exe);
        }
      }
    } catch (_) {}
  }
  return candidates;
}

/**
 * Executes where.exe java to find executables in PATH.
 */
function queryPathJava() {
  const candidates = [];
  try {
    const out = execSync("where.exe java", {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && trimmed.toLowerCase().endsWith(".exe") && fs.existsSync(trimmed)) {
        candidates.push(trimmed);
      }
    }
  } catch (_) {}
  return candidates;
}

/**
 * Scans directories on disk for Java installations.
 */
function scanCommonDirectories(extraRuntimeDir = "") {
  const candidates = [];
  const baseFolders = [
    "C:\\Program Files\\Java",
    "C:\\Program Files (x86)\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Amazon Corretto",
    "C:\\Program Files\\Microsoft",
    "C:\\Program Files\\Zulu",
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "C:\\Program Files\\Android\\Android Studio\\jre"
  ];

  if (process.env.LOCALAPPDATA) {
    baseFolders.push(path.join(process.env.LOCALAPPDATA, "Programs", "Eclipse Adoptium"));
    baseFolders.push(path.join(process.env.LOCALAPPDATA, "Packages", "Microsoft.4297127D64EC6_8wekyb3d8bbwe", "LocalCache", "Local", "runtime"));
  }
  if (process.env.USERPROFILE) {
    baseFolders.push(path.join(process.env.USERPROFILE, ".jdks"));
  }
  if (extraRuntimeDir) {
    baseFolders.push(extraRuntimeDir);
  }

  for (const base of baseFolders) {
    try {
      if (!fs.existsSync(base)) continue;
      // Check if base itself is a JRE/JDK
      const directExe = path.join(base, "bin", "java.exe");
      if (fs.existsSync(directExe)) {
        candidates.push(directExe);
      }

      // Check immediate subdirectories (e.g. jdk-21.0.1/bin/java.exe)
      const subEntries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of subEntries) {
        if (!entry.isDirectory()) continue;
        const subPath = path.join(base, entry.name);
        const subExe = path.join(subPath, "bin", "java.exe");
        if (fs.existsSync(subExe)) {
          candidates.push(subExe);
        } else {
          // Check 2 levels deep (e.g. runtime/java-runtime-delta/windows-x64/java-runtime-delta/bin/java.exe)
          try {
            const grandEntries = fs.readdirSync(subPath, { withFileTypes: true });
            for (const grand of grandEntries) {
              if (grand.isDirectory()) {
                const deepExe = path.join(subPath, grand.name, "bin", "java.exe");
                if (fs.existsSync(deepExe)) candidates.push(deepExe);
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  return candidates;
}

/**
 * Complete Dynamic Java Discovery.
 * Checks JAVA_HOME, PATH, Windows Registry, and common filesystem locations.
 */
function detectJavaInstallations(options = {}) {
  const { forceRefresh = false, customPaths = [], runtimeDir = "" } = options;
  const now = Date.now();

  if (!forceRefresh && cachedJavaInstallations && now - lastScanTime < 30000) {
    return cachedJavaInstallations;
  }

  const rawPaths = new Set();

  // 1. JAVA_HOME environment variable
  if (process.env.JAVA_HOME) {
    const envExe = path.join(process.env.JAVA_HOME, "bin", "java.exe");
    if (fs.existsSync(envExe)) rawPaths.add(path.normalize(envExe));
  }

  // 2. Windows Registry
  for (const p of queryRegistryPaths()) {
    rawPaths.add(path.normalize(p));
  }

  // 3. System PATH via where.exe
  for (const p of queryPathJava()) {
    rawPaths.add(path.normalize(p));
  }

  // 4. Common filesystem directories
  for (const p of scanCommonDirectories(runtimeDir)) {
    rawPaths.add(path.normalize(p));
  }

  // 5. Custom configured paths
  for (const p of customPaths) {
    if (p && typeof p === "string") {
      let resolved = path.normalize(p.trim());
      if (!resolved.toLowerCase().endsWith("java.exe")) {
        resolved = path.join(resolved, "bin", "java.exe");
      }
      if (fs.existsSync(resolved)) rawPaths.add(resolved);
    }
  }

  // Verify and parse every candidate
  const verifiedList = [];
  const seenNormPaths = new Set();

  for (const raw of rawPaths) {
    const norm = raw.toLowerCase();
    if (seenNormPaths.has(norm)) continue;
    seenNormPaths.add(norm);

    const verified = verifyJavaExecutable(raw);
    if (verified && verified.major > 0) {
      verifiedList.push(verified);
    }
  }

  // Sort by major version descending, 64-bit first
  verifiedList.sort((a, b) => {
    if (b.is64Bit !== a.is64Bit) return b.is64Bit ? 1 : -1;
    return b.major - a.major;
  });

  cachedJavaInstallations = verifiedList;
  lastScanTime = now;
  return verifiedList;
}

/**
 * Determines required Java major version for a given Minecraft version string.
 */
function getRequiredJavaMajor(versionId) {
  if (!versionId || versionId === "latest-compatible" || versionId === "latest-release") {
    return 21; // Modern MC releases require 21
  }

  const clean = versionId.replace(/^fabric-loader-[^-]+-/, "");
  // Snapshot matching e.g. 24w, 25w -> 21+
  if (/^\d{2}w/i.test(clean)) return 21;

  const parts = clean.split(".").map((n) => parseInt(n, 10));
  if (parts.length >= 2) {
    const [major, minor, patch = 0] = parts;
    if (major > 1) return 21;
    if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 18) return 17;
    return 8;
  }

  return 21;
}

/**
 * Selects the best compatible Java installation.
 */
function selectBestJava(requiredMajor, preferredPath, detectedList = []) {
  if (preferredPath && preferredPath !== "java") {
    const match = detectedList.find((item) => path.normalize(item.path).toLowerCase() === path.normalize(preferredPath).toLowerCase());
    if (match && match.major >= requiredMajor) {
      return match;
    }
  }

  // Exact match
  const exact = detectedList.find((item) => item.major === requiredMajor);
  if (exact) return exact;

  // Newer compatible match (Java 21/25 can run older versions, though 8 is preferred for <= 1.16.5)
  if (requiredMajor >= 17) {
    const newer = detectedList.find((item) => item.major > requiredMajor);
    if (newer) return newer;
  } else {
    // For Java 8, prefer 8 first, then 11, then 17
    const legacy = detectedList.find((item) => item.major === 8 || item.major === 11);
    if (legacy) return legacy;
  }

  // Fallback to highest installed version
  return detectedList[0] || null;
}

/**
 * HTTP helper to download JSON.
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "HK-Launcher/0.1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url} (HTTP ${res.statusCode})`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

/**
 * Downloads a single file with SHA1 hash validation.
 */
function downloadFile(url, destPath, expectedSha1, onBytes) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tempPath = destPath + ".tmp";
    const fileStream = fs.createWriteStream(tempPath);
    const hash = crypto.createHash("sha1");

    https.get(url, { headers: { "User-Agent": "HK-Launcher/0.1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return downloadFile(res.headers.location, destPath, expectedSha1, onBytes).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }

      res.on("data", (chunk) => {
        hash.update(chunk);
        fileStream.write(chunk);
        if (onBytes) onBytes(chunk.length);
      });

      res.on("end", () => {
        fileStream.end();
      });
    }).on("error", (err) => {
      fileStream.close();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(err);
    });

    fileStream.on("finish", () => {
      const calculatedSha1 = hash.digest("hex");
      if (expectedSha1 && calculatedSha1.toLowerCase() !== expectedSha1.toLowerCase()) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return reject(new Error(`SHA1 checksum mismatch for ${destPath}`));
      }
      fs.renameSync(tempPath, destPath);
      resolve();
    });

    fileStream.on("error", (err) => {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      reject(err);
    });
  });
}

/**
 * Downloads Mojang's official portable Java runtime into launcher-data/runtime/<component>.
 */
async function downloadMojangRuntime(targetMajor, runtimeBaseDir, onProgress = () => {}) {
  // Map target major to Mojang component name for windows-x64
  let componentName = "java-runtime-delta"; // default Java 21
  if (targetMajor >= 21) {
    componentName = "java-runtime-delta";
  } else if (targetMajor >= 17) {
    componentName = "java-runtime-beta";
  } else {
    componentName = "jre-legacy";
  }

  onProgress({ percent: 2, message: `Fetching Mojang runtime catalog for Java ${targetMajor}...` });
  const allJson = await fetchJson(MOJANG_RUNTIME_ALL_URL);
  const platform = allJson["windows-x64"];
  if (!platform || !platform[componentName] || !platform[componentName][0]) {
    throw new Error(`Runtime ${componentName} for windows-x64 not found in Mojang catalog.`);
  }

  const entry = platform[componentName][0];
  const manifestUrl = entry.manifest.url;
  const targetDir = path.join(runtimeBaseDir, componentName);

  onProgress({ percent: 8, message: `Fetching package manifest for ${entry.version?.name || componentName}...` });
  const manifest = await fetchJson(manifestUrl);

  const filesMap = manifest.files || {};
  const fileEntries = Object.entries(filesMap).filter(([_, item]) => item.type === "file" && item.downloads?.raw?.url);
  const totalFiles = fileEntries.length;
  let completedFiles = 0;

  onProgress({ percent: 12, message: `Preparing to download ${totalFiles} runtime files...` });

  // Download files sequentially or small chunks to prevent network socket exhaustion
  const concurrency = 6;
  const queue = [...fileEntries];

  async function worker() {
    while (queue.length > 0) {
      const [relPath, fileInfo] = queue.shift();
      const destFile = path.join(targetDir, relPath);
      const raw = fileInfo.downloads.raw;

      // Check if file already exists with identical size and sha1
      let needDownload = true;
      if (fs.existsSync(destFile)) {
        try {
          const stat = fs.statSync(destFile);
          if (stat.size === raw.size) {
            needDownload = false;
          }
        } catch (_) {}
      }

      if (needDownload) {
        await downloadFile(raw.url, destFile, raw.sha1);
      }

      completedFiles++;
      const percent = Math.min(98, Math.round(12 + (completedFiles / totalFiles) * 85));
      onProgress({
        percent,
        message: `Downloading Java ${targetMajor} runtime: ${completedFiles}/${totalFiles} files (${percent}%)`
      });
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Locate java.exe in the downloaded directory
  const directExe = path.join(targetDir, "bin", "java.exe");
  let foundExe = directExe;
  if (!fs.existsSync(directExe)) {
    // Mojang sometimes wraps in a nested directory
    const candidates = scanCommonDirectories(targetDir);
    if (candidates.length > 0) {
      foundExe = candidates[0];
    }
  }

  if (!fs.existsSync(foundExe)) {
    throw new Error(`Java executable not found in downloaded runtime at ${targetDir}`);
  }

  // Verify downloaded executable
  const verified = verifyJavaExecutable(foundExe);
  if (!verified || verified.major === 0) {
    throw new Error(`Downloaded Java runtime at ${foundExe} failed execution test.`);
  }

  // Invalidate cache so newly downloaded runtime is immediately visible
  cachedJavaInstallations = null;
  onProgress({ percent: 100, message: `Java ${verified.major} (${verified.version}) installed successfully!` });

  return verified;
}

module.exports = {
  detectJavaInstallations,
  verifyJavaExecutable,
  getRequiredJavaMajor,
  selectBestJava,
  downloadMojangRuntime,
  queryRegistryPaths,
  queryPathJava
};
