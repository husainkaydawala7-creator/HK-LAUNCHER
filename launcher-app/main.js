const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog, clipboard, Menu, screen } = require("electron");
const fs = require("node:fs/promises");
const fss = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const AdmZip = require("adm-zip");
const { javaManager, modrinthService, OfflineCacheManager, dragDropHandler } = require("./services");
const { scanHardware } = require("../src/fpsOptimizer/hardwareScanner");
const { analyzeSettings } = require("../src/fpsOptimizer/settingsAnalyzer");
const { buildRecommendations } = require("../src/fpsOptimizer/recommendationEngine");
const { optimizerPresets, advancedModes } = require("../src/fpsOptimizer/presetManager");
const { applyRecommendedSettings, resetOptimizerSettings } = require("../src/fpsOptimizer/applyOptimizer");
const { buildOptimizerViewModel } = require("../src/fpsOptimizer/fpsOptimizerUI");

const devRootDir = path.resolve(__dirname, "..");
const rootDir = app.isPackaged ? path.join(app.getPath("userData"), "data") : devRootDir;
const paths = {
  root: rootDir,
  appData: path.join(rootDir, "launcher-app"),
  accounts: path.join(rootDir, "launcher-app", "accounts", "profiles.json"),
  accountOverrides: path.join(rootDir, "launcher-app", "accounts", "overrides.json"),
  serverLogins: path.join(rootDir, "launcher-app", "servers", "logins.json"),
  savedServers: path.join(rootDir, "launcher-app", "servers", "saved.json"),
  profiles: path.join(rootDir, "launcher-app", "launch-profiles", "profiles.json"),
  logs: path.join(rootDir, "launcher-app", "logs"),
  settings: path.join(rootDir, "launcher-app", "settings.json"),
  optimizerBaseline: path.join(rootDir, "launcher-app", "settings", "fps-optimizer-baseline.json"),
  launcherData: path.join(rootDir, "launcher-data"),
  sharedMinecraft: path.join(rootDir, "shared-minecraft"),
  instances: path.join(rootDir, "instances")
};

const runningProcesses = new Map();
const pendingAuthFlows = new Map();
const downloadEvents = [];
let bridgeServer = null;
let bridgePort = 0;
const bridgeToken = crypto.randomBytes(24).toString("hex");
const versionManifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const offlineCache = new OfflineCacheManager(path.join(rootDir, "launcher-data", "cache"), path.join(rootDir, "shared-minecraft", "versions"));
const rendererIndexPath = path.join(__dirname, "renderer", "index.html");
const trustedRendererUrl = pathToFileURL(rendererIndexPath).toString();
const isPackagedRuntime = app.isPackaged;
const blockedRuntimeFlags = ["--remote-debugging-port", "--inspect", "--inspect-brk"];

if (isPackagedRuntime && process.argv.some((arg) => blockedRuntimeFlags.some((flag) => arg.startsWith(flag)))) {
  app.exit(1);
}

const defaultSettings = {
  javaPath: "java",
  minecraftVersionId: "latest-compatible",
  fabricVersionId: "",
  modloader: "fabric",
  taggedAccountId: "",
  microsoftClientId: "",
  serverIp: "",
  smartFpsEnabled: true,
  ramMb: 4096,
  fpsCap: 0,
  windowWidth: 1280,
  windowHeight: 720,
  renderDistance: 6,
  simulationDistance: 4,
  entityDistance: 55,
  graphicsMode: "fast",
  particles: "minimal",
  clouds: "false",
  entityShadows: false,
  smoothLighting: false,
  biomeBlendRadius: 0,
  mipmapLevels: 0,
  vsync: false,
  fullscreen: false,
  shaderEnabled: false,
  jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=32M",
  maxParallelLaunches: 5,
  staggerLaunchMs: 2500,
  closeLauncherAfterLaunch: false,
  lowPriorityAfk: false,
  updateChannel: "stable"
};

const sharedProfileId = "shared-launch";
const sharedProfileDefaults = {
  id: sharedProfileId,
  name: "Automatic Performance Setup",
  minecraftVersionId: "latest-compatible",
  modloader: "fabric",
  gameDirName: "shared-launch",
  ramMb: 4096,
  fpsCap: 165,
  width: 1280,
  height: 720,
  renderDistance: 6,
  simulationDistance: 4,
  entityDistance: 55,
  graphicsMode: "fast",
  particles: "minimal",
  clouds: "false",
  entityShadows: false,
  smoothLighting: false,
  biomeBlendRadius: 0,
  mipmapLevels: 0,
  vsync: false,
  fullscreen: false,
  shaderEnabled: false,
  jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=32M"
};

const setupPresets = [
  {
    id: "smart-fps",
    name: "Automatic Performance",
    description: "Hardware-aware setup that calculates FPS, RAM, graphics, and Java settings automatically.",
    settings: {
      smartFpsEnabled: true,
      modloader: "fabric",
      ramMb: 4096,
      fpsCap: 0,
      windowWidth: 1280,
      windowHeight: 720,
      renderDistance: 6,
      simulationDistance: 4,
      entityDistance: 55,
      graphicsMode: "fast",
      particles: "minimal",
      clouds: "false",
      entityShadows: false,
      smoothLighting: false,
      biomeBlendRadius: 0,
      mipmapLevels: 0,
      vsync: false,
      fullscreen: false,
      shaderEnabled: false,
      jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=32M"
    }
  }
];

const performanceModes = [
  {
    id: "smart-fps",
    name: "Automatic Performance",
    use: "Best stable FPS for the detected hardware",
    settings: setupPresets[0].settings
  }
];

const performancePackMods = [
  "Sodium",
  "Lithium",
  "FerriteCore",
  "ImmediatelyFast",
  "EntityCulling",
  "ModernFix",
  "Krypton",
  "Dynamic FPS",
  "More Culling",
  "Fabric API",
  "Mod Menu"
];

const javaCandidates = [
  { path: "C:\\Program Files\\Java\\jdk-25\\bin\\java.exe", major: 25, name: "Java 25" },
  { path: "C:\\Program Files\\Eclipse Adoptium\\jdk-25\\bin\\java.exe", major: 25, name: "Temurin Java 25" },
  { path: "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe", major: 21, name: "Android Studio JBR 21" },
  { path: "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe", major: 21, name: "Java 21" },
  { path: "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe", major: 17, name: "Java 17" },
  { path: "C:\\Program Files\\Java\\jre-1.8\\bin\\java.exe", major: 8, name: "Java 8" },
  { path: "C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath_target_9358734\\java.exe", major: 8, name: "Oracle Java 8" }
];

const modSuggestions = [
  { name: "Sodium", loader: "Fabric", use: "FPS boost" },
  { name: "Lithium", loader: "Fabric", use: "Game logic optimization" },
  { name: "FerriteCore", loader: "Fabric/Forge", use: "RAM optimization" },
  { name: "ImmediatelyFast", loader: "Fabric/Forge", use: "Rendering optimization" },
  { name: "Entity Culling", loader: "Fabric/Forge", use: "More FPS near entities" },
  { name: "More Culling", loader: "Fabric", use: "Extra hidden block/entity culling" },
  { name: "Iris", loader: "Fabric", use: "Shaders support" },
  { name: "Mod Menu", loader: "Fabric", use: "Manage Fabric mods" },
  { name: "Fabric API", loader: "Fabric", use: "Common dependency for Fabric mods" }
];

const defaultProfiles = [
  {
    id: "smart-fps",
    name: "Automatic Performance Setup",
    minecraftVersionId: "latest-compatible",
    modloader: "fabric",
    gameDirName: "smart-fps",
    ramMb: 4096,
    fpsCap: 0,
    width: 1280,
    height: 720,
    renderDistance: 6,
    simulationDistance: 4,
    entityDistance: 55,
    graphicsMode: "fast",
    particles: "minimal",
    clouds: "false",
    entityShadows: false,
    smoothLighting: false,
    biomeBlendRadius: 0,
    mipmapLevels: 0,
    vsync: false,
    fullscreen: false,
    shaderEnabled: false,
    jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=32M"
  }
];

async function ensureLayout() {
  const dirs = [
    path.dirname(paths.accounts),
    path.dirname(paths.accountOverrides),
    path.dirname(paths.serverLogins),
    path.dirname(paths.savedServers),
    path.dirname(paths.profiles),
    path.dirname(paths.optimizerBaseline),
    paths.logs,
    path.join(paths.launcherData, "versions"),
    path.join(paths.launcherData, "libraries"),
    path.join(paths.launcherData, "instances"),
    path.join(paths.launcherData, "logs"),
    path.join(paths.launcherData, "crash-reports"),
    path.join(paths.launcherData, "backups"),
    path.join(paths.launcherData, "settings"),
    path.join(paths.launcherData, "loaders"),
    path.join(paths.launcherData, "shared", "mods"),
    path.join(paths.launcherData, "shared", "resourcepacks"),
    path.join(paths.launcherData, "shared", "shaderpacks"),
    path.join(paths.launcherData, "shared", "config"),
    path.join(rootDir, "profiles"),
    path.join(rootDir, "profiles", "smart-fps", "mods"),
    path.join(rootDir, "profiles", "smart-fps", "resourcepacks"),
    path.join(rootDir, "profiles", "smart-fps", "shaderpacks"),
    path.join(rootDir, "profiles", "fps-packs", "resourcepacks"),
    path.join(paths.sharedMinecraft, "versions"),
    path.join(paths.sharedMinecraft, "libraries"),
    path.join(paths.sharedMinecraft, "assets"),
    path.join(paths.sharedMinecraft, "mods"),
    path.join(paths.instances, sharedProfileDefaults.gameDirName),
    path.join(paths.instances, sharedProfileDefaults.gameDirName, "mods"),
    path.join(paths.instances, sharedProfileDefaults.gameDirName, "resourcepacks"),
    path.join(paths.instances, sharedProfileDefaults.gameDirName, "shaderpacks"),
    path.join(paths.instances, "account-1"),
    path.join(paths.instances, "account-2"),
    path.join(paths.instances, "account-3"),
    path.join(paths.instances, "account-4")
  ];

  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
  await writeJsonIfMissing(paths.settings, defaultSettings);
  await writeJsonIfMissing(paths.accounts, []);
  await writeJsonIfMissing(paths.accountOverrides, {});
  await writeJsonIfMissing(paths.serverLogins, []);
  await writeJsonIfMissing(paths.savedServers, []);
  await writeJsonIfMissing(paths.profiles, defaultProfiles);
  await repairSettings();
}

async function writeJsonIfMissing(filePath, value) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSettings() {
  const raw = { ...defaultSettings, ...(await readJson(paths.settings, defaultSettings)) };
  try {
    return sanitizeSettings(raw);
  } catch {
    const safeDefaults = sanitizeSettings(defaultSettings);
    await writeJson(paths.settings, safeDefaults);
    return safeDefaults;
  }
}

function cleanString(value, maxLength = 160) {
  return String(value ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanBoolean(value) {
  return value === true || value === "true";
}

function requireSafeId(value, label = "id") {
  const clean = cleanString(value, 120);
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(clean)) {
    throw new Error(`Invalid ${label}.`);
  }
  return clean;
}

function requireMinecraftName(value) {
  const clean = cleanString(value, 16);
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(clean)) {
    throw new Error("Minecraft usernames must be 1-16 letters, numbers, or underscores (no spaces).");
  }
  return clean;
}

function requireSafePathSegment(value, fallback = "profile") {
  const clean = sanitizePathSegment(value || fallback);
  if (clean === "." || clean === ".." || !clean) throw new Error("Invalid folder name.");
  return clean;
}

function assertInsideDirectory(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error("Blocked path outside the launcher data folder.");
  }
  return target;
}

function requireHttpsUrl(url, label = "download") {
  const parsed = new URL(cleanString(url, 2048));
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  return parsed.toString();
}

function sanitizeJavaPath(value) {
  const clean = cleanString(value || "java", 520);
  if (clean === "java") return clean;
  if (!path.isAbsolute(clean)) throw new Error("Java path must be an absolute path or 'java'.");
  const file = path.basename(clean).toLowerCase();
  if (!["java.exe", "javaw.exe", "java"].includes(file)) throw new Error("Java path must point to java.exe or javaw.exe.");
  return clean;
}

function sanitizeJvmArgs(value) {
  const denied = /^-(?:javaagent|agentlib|agentpath|xbootclasspath)|^-D(?:java\.ext\.dirs|java\.endorsed\.dirs)=/i;
  const args = splitArgs(value || defaultSettings.jvmArgs);
  if (args.some((arg) => denied.test(arg))) {
    throw new Error("Unsafe JVM agent or bootclasspath arguments are not allowed.");
  }
  return args.join(" ").slice(0, 1200);
}

function sanitizeSettings(input = {}) {
  const allowedVersions = /^[a-zA-Z0-9._:+-]{1,96}$/;
  const minecraftVersionId = cleanString(input.minecraftVersionId || defaultSettings.minecraftVersionId, 96);
  const fabricVersionId = cleanString(input.fabricVersionId || "", 120);
  return {
    ...defaultSettings,
    javaPath: sanitizeJavaPath(input.javaPath || defaultSettings.javaPath),
    minecraftVersionId: allowedVersions.test(minecraftVersionId) ? minecraftVersionId : defaultSettings.minecraftVersionId,
    fabricVersionId: !fabricVersionId || allowedVersions.test(fabricVersionId) ? fabricVersionId : "",
    modloader: ["fabric", "vanilla"].includes(input.modloader) ? input.modloader : defaultSettings.modloader,
    taggedAccountId: input.taggedAccountId ? requireSafeId(input.taggedAccountId, "tagged account id") : "",
    microsoftClientId: cleanString(input.microsoftClientId || "", 160),
    serverIp: sanitizeServerAddress(input.serverIp || "", { allowEmpty: true }),
    smartFpsEnabled: true,
    ramMb: clampNumber(input.ramMb, defaultSettings.ramMb, 1024, 32768),
    fpsCap: clampNumber(input.fpsCap, defaultSettings.fpsCap, 0, 2000),
    windowWidth: clampNumber(input.windowWidth, defaultSettings.windowWidth, 640, 7680),
    windowHeight: clampNumber(input.windowHeight, defaultSettings.windowHeight, 360, 4320),
    renderDistance: clampNumber(input.renderDistance, defaultSettings.renderDistance, 2, 32),
    simulationDistance: clampNumber(input.simulationDistance, defaultSettings.simulationDistance, 2, 32),
    entityDistance: clampNumber(input.entityDistance, defaultSettings.entityDistance, 10, 500),
    graphicsMode: ["fast", "fancy", "fabulous"].includes(input.graphicsMode) ? input.graphicsMode : defaultSettings.graphicsMode,
    particles: ["minimal", "decreased", "all"].includes(input.particles) ? input.particles : defaultSettings.particles,
    clouds: ["false", "fast", "fancy", "true"].includes(String(input.clouds)) ? String(input.clouds) : defaultSettings.clouds,
    entityShadows: cleanBoolean(input.entityShadows),
    smoothLighting: cleanBoolean(input.smoothLighting),
    biomeBlendRadius: clampNumber(input.biomeBlendRadius, defaultSettings.biomeBlendRadius, 0, 7),
    mipmapLevels: clampNumber(input.mipmapLevels, defaultSettings.mipmapLevels, 0, 4),
    vsync: cleanBoolean(input.vsync),
    fullscreen: cleanBoolean(input.fullscreen),
    shaderEnabled: cleanBoolean(input.shaderEnabled),
    jvmArgs: sanitizeJvmArgs(input.jvmArgs || defaultSettings.jvmArgs),
    maxParallelLaunches: clampNumber(input.maxParallelLaunches, defaultSettings.maxParallelLaunches, 1, 5),
    staggerLaunchMs: clampNumber(input.staggerLaunchMs, defaultSettings.staggerLaunchMs, 0, 30000),
    closeLauncherAfterLaunch: cleanBoolean(input.closeLauncherAfterLaunch),
    lowPriorityAfk: cleanBoolean(input.lowPriorityAfk),
    updateChannel: ["stable", "beta"].includes(input.updateChannel) ? input.updateChannel : defaultSettings.updateChannel
  };
}

function sanitizeAccountInput(input = {}, existing = {}) {
  const current = existing || {};
  const authMode = input?.authMode === "local" ? "local" : "microsoft";
  const name = requireMinecraftName(input?.name || current.name || "");
  const uuid = cleanString(input?.uuid || current.uuid || "", 64);
  const skinUrl = cleanString(input?.skinUrl || current.skinUrl || "", 2048);
  if (skinUrl && !/^https:\/\//i.test(skinUrl)) throw new Error("Skin URL must use HTTPS.");
  return {
    id: input?.id ? requireSafeId(input.id, "account id") : current.id || `account-${Date.now()}`,
    name,
    authMode,
    email: cleanString(input?.email || current.email || "", 180),
    uuid: uuid.replace(/[^a-fA-F0-9-]/g, ""),
    skinUrl,
    instanceId: requireSafePathSegment(input?.instanceId || current.instanceId || `account-${name}`, `account-${name}`),
    token: input?.token ? encryptToken(input.token) : current.token || "",
    refreshToken: current.refreshToken || "",
    expiresAt: current.expiresAt || 0,
    xuid: cleanString(current.xuid || "", 80)
  };
}

function sanitizeOverrideInput(input = {}) {
  const safeInput = input || {};
  const output = {};
  if (safeInput.ramMb !== undefined && safeInput.ramMb !== "") output.ramMb = clampNumber(safeInput.ramMb, 2048, 1024, 32768);
  if (input.fpsCap !== undefined && input.fpsCap !== "") output.fpsCap = clampNumber(input.fpsCap, 0, 0, 2000);
  if (input.width !== undefined && input.width !== "") output.width = clampNumber(input.width, 854, 640, 7680);
  if (input.height !== undefined && input.height !== "") output.height = clampNumber(input.height, 480, 360, 4320);
  if (input.renderDistance !== undefined && input.renderDistance !== "") output.renderDistance = clampNumber(input.renderDistance, 4, 2, 32);
  if (input.simulationDistance !== undefined && input.simulationDistance !== "") output.simulationDistance = clampNumber(input.simulationDistance, 4, 2, 32);
  if (input.entityDistance !== undefined && input.entityDistance !== "") output.entityDistance = clampNumber(input.entityDistance, 50, 10, 500);
  if (input.javaPath !== undefined && input.javaPath !== "") output.javaPath = sanitizeJavaPath(input.javaPath);
  if (input.label !== undefined && input.label !== "") output.label = cleanString(input.label, 80);
  return output;
}

function sanitizeServerAddress(value, options = {}) {
  const clean = cleanString(value, 255);
  if (!clean && options.allowEmpty) return "";
  const [host, portText] = clean.split(":");
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(host || "")) throw new Error("Invalid server address.");
  if (portText !== undefined) {
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid server port.");
  }
  return portText === undefined ? host : `${host}:${Number(portText)}`;
}

function sanitizeServerLoginInput(input = {}, existing = null) {
  const commandPrefix = cleanString(input.commandPrefix || existing?.commandPrefix || "/login", 32);
  if (!/^\/[a-zA-Z0-9_-]{1,31}$/.test(commandPrefix)) throw new Error("Login command prefix must look like /login.");
  return {
    id: input.id ? requireSafeId(input.id, "server login id") : `server-login-${Date.now()}`,
    label: cleanString(input.label || existing?.label || "Server login", 100),
    serverAddress: sanitizeServerAddress(input.serverAddress || existing?.serverAddress || "", { allowEmpty: true }),
    username: cleanString(input.username || existing?.username || "", 80),
    commandPrefix,
    password: input.password ? encryptToken(String(input.password).slice(0, 512)) : existing?.password || "",
    updatedAt: new Date().toISOString()
  };
}

function getSharedLaunchProfile(settings = defaultSettings) {
  const merged = { ...defaultSettings, ...settings };
  return {
    ...sharedProfileDefaults,
    minecraftVersionId: merged.minecraftVersionId || sharedProfileDefaults.minecraftVersionId,
    modloader: merged.modloader || sharedProfileDefaults.modloader,
    ramMb: Number(merged.ramMb || sharedProfileDefaults.ramMb),
    fpsCap: Number(merged.fpsCap || sharedProfileDefaults.fpsCap),
    width: Number(merged.windowWidth || sharedProfileDefaults.width),
    height: Number(merged.windowHeight || sharedProfileDefaults.height),
    renderDistance: Number(merged.renderDistance || sharedProfileDefaults.renderDistance),
    simulationDistance: Number(merged.simulationDistance || sharedProfileDefaults.simulationDistance),
    entityDistance: Number(merged.entityDistance || sharedProfileDefaults.entityDistance),
    graphicsMode: merged.graphicsMode || sharedProfileDefaults.graphicsMode,
    particles: merged.particles || sharedProfileDefaults.particles,
    clouds: merged.clouds || sharedProfileDefaults.clouds,
    entityShadows: merged.entityShadows !== undefined ? Boolean(merged.entityShadows) : sharedProfileDefaults.entityShadows,
    smoothLighting: merged.smoothLighting !== undefined ? Boolean(merged.smoothLighting) : sharedProfileDefaults.smoothLighting,
    biomeBlendRadius: Number(merged.biomeBlendRadius ?? sharedProfileDefaults.biomeBlendRadius),
    mipmapLevels: Number(merged.mipmapLevels ?? sharedProfileDefaults.mipmapLevels),
    vsync: Boolean(merged.vsync),
    fullscreen: Boolean(merged.fullscreen),
    shaderEnabled: Boolean(merged.shaderEnabled),
    jvmArgs: merged.jvmArgs || sharedProfileDefaults.jvmArgs,
    javaPath: merged.javaPath || defaultSettings.javaPath
  };
}

function applyAccountOverride(profile, override = {}) {
  const next = { ...profile };
  const safeOverride = sanitizeOverrideInput(override || {});
  for (const [key, value] of Object.entries(safeOverride)) {
    if (value === "" || value === null || value === undefined) continue;
    if (["ramMb", "fpsCap", "width", "height", "renderDistance", "simulationDistance", "entityDistance"].includes(key)) {
      next[key] = Number(value);
    } else if (["javaPath", "label"].includes(key)) {
      next[key] = String(value);
    }
  }
  return next;
}

async function repairSettings() {
  const settings = await readSettings();
  const javaPath = settings.javaPath || "java";
  if (javaPath !== "java" && fss.existsSync(javaPath)) return;
  const detectedJava = javaCandidates.find((candidate) => fss.existsSync(candidate.path));
  if (detectedJava && javaPath !== detectedJava.path) {
    await writeJson(paths.settings, { ...defaultSettings, ...settings, javaPath: detectedJava.path });
  }
}

async function downloadJson(url) {
  const safeUrl = requireHttpsUrl(url, "JSON download");
  const response = await fetch(safeUrl);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${safeUrl}`);
  return response.json();
}

async function hashFile(filePath, algorithm = "sha1") {
  const hash = crypto.createHash(algorithm);
  const stream = fss.createReadStream(filePath);
  await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function fileMatchesExpected(filePath, expected = {}) {
  if (!fss.existsSync(filePath)) return false;
  const stats = await fs.stat(filePath);
  if (expected.size && Number(expected.size) !== stats.size) return false;
  if (expected.sha1 && (await hashFile(filePath, "sha1")).toLowerCase() !== String(expected.sha1).toLowerCase()) return false;
  if (expected.sha256 && (await hashFile(filePath, "sha256")).toLowerCase() !== String(expected.sha256).toLowerCase()) return false;
  return true;
}

async function verifyDownloadedFile(filePath, expected = {}, label = path.basename(filePath)) {
  if (!(await fileMatchesExpected(filePath, expected))) {
    throw new Error(`Downloaded ${label} failed integrity verification.`);
  }
}

async function downloadFile(url, filePath, progress = () => {}, progressStart = 0, progressEnd = 0, label = path.basename(filePath), expected = {}) {
  const safeUrl = requireHttpsUrl(url, label);
  assertInsideDirectory(paths.sharedMinecraft, filePath);

  if (await fileMatchesExpected(filePath, expected)) {
    progress(progressEnd || progressStart, `${label} already cached`);
    return;
  }

  const response = await fetch(safeUrl);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${safeUrl}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  progress(progressStart, `Downloading ${label}`);

  const total = Number(response.headers.get("content-length") || 0);
  if (total && response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.length;
      const fraction = received / total;
      progress(progressStart + (progressEnd - progressStart) * fraction, `Downloading ${label}`);
    }
    await fs.writeFile(filePath, Buffer.concat(chunks));
    await verifyDownloadedFile(filePath, expected, label);
    progress(progressEnd, `Downloaded ${label}`);
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  await verifyDownloadedFile(filePath, expected, label);
  progress(progressEnd || progressStart, `Downloaded ${label}`);
}

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error_description || json.errorMessage || `Request failed ${response.status}`);
  return json;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.errorMessage || json.error || `Request failed ${response.status}`);
  return json;
}

async function getJson(url, bearerToken) {
  const response = await fetch(url, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.errorMessage || json.error || `Request failed ${response.status}`);
  return json;
}

function encryptToken(token) {
  if (!token) return "";
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(token).toString("base64")}`;
  }
  return `plain:${Buffer.from(token, "utf8").toString("base64")}`;
}

function decryptToken(storedToken) {
  if (!storedToken) return "";
  if (storedToken.startsWith("safe:") && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(storedToken.slice(5), "base64"));
  }
  if (storedToken.startsWith("plain:")) {
    return Buffer.from(storedToken.slice(6), "base64").toString("utf8");
  }
  return "";
}

function publicAccount(account) {
  const { token, refreshToken, ...safeAccount } = account;
  const authMode = account.authMode === "local" ? "local" : "microsoft";
  return {
    ...safeAccount,
    authMode,
    hasToken: Boolean(token),
    disabledReason: authMode === "local" ? "Local/offline profile for singleplayer or private offline-mode servers." : ""
  };
}

function publicServerLogin(login) {
  const { password, ...safeLogin } = login;
  return { ...safeLogin, hasPassword: Boolean(password) };
}

function safeCompareSecret(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""), "utf8");
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function offlineUuid(name) {
  return crypto
    .createHash("md5")
    .update(`OfflinePlayer:${name}`)
    .digest("hex");
}

const OFFICIAL_MINECRAFT_CLIENT_ID = "00000000402b5328";
const OFFICIAL_MINECRAFT_REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf";
const OFFICIAL_MINECRAFT_SCOPE = "service::user.auth.xboxlive.com::MBI_SSL";

async function startMicrosoftLoginInteractive() {
  return new Promise((resolve, reject) => {
    let completed = false;
    const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined;

    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      title: "Sign in to Minecraft with Microsoft",
      autoHideMenuBar: true,
      modal: Boolean(parent),
      parent,
      backgroundColor: "#ffffff",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const loginUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${OFFICIAL_MINECRAFT_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(OFFICIAL_MINECRAFT_SCOPE)}&redirect_uri=${encodeURIComponent(OFFICIAL_MINECRAFT_REDIRECT_URI)}`;

    async function handleUrl(targetUrl) {
      if (!targetUrl.startsWith(OFFICIAL_MINECRAFT_REDIRECT_URI)) return;
      if (completed) return;
      completed = true;

      try {
        const urlObj = new URL(targetUrl);
        const code = urlObj.searchParams.get("code");
        const error = urlObj.searchParams.get("error_description") || urlObj.searchParams.get("error");

        if (error) {
          throw new Error(`Microsoft sign-in was not completed: ${error}`);
        }
        if (!code) {
          throw new Error("No authorization code received from Microsoft.");
        }

        if (!authWindow.isDestroyed()) {
          authWindow.destroy();
        }

        const tokenResponse = await postForm("https://login.live.com/oauth20_token.srf", {
          client_id: OFFICIAL_MINECRAFT_CLIENT_ID,
          code,
          grant_type: "authorization_code",
          redirect_uri: OFFICIAL_MINECRAFT_REDIRECT_URI,
          scope: OFFICIAL_MINECRAFT_SCOPE
        });

        const account = await createMinecraftAccountFromMicrosoftToken(tokenResponse);
        const accounts = await readJson(paths.accounts, []);
        const existing = accounts.find((item) => item.uuid === account.uuid);
        const next = existing
          ? accounts.map((item) => (item.uuid === account.uuid ? { ...item, ...account, id: item.id } : item))
          : [...accounts, account];
        await writeJson(paths.accounts, next);

        const settings = await readSettings();
        if (!settings.taggedAccountId) {
          await writeJson(paths.settings, { ...settings, taggedAccountId: account.id });
        }

        resolve({
          success: true,
          account: publicAccount(account),
          accounts: next.map(publicAccount)
        });
      } catch (err) {
        if (!authWindow.isDestroyed()) {
          authWindow.destroy();
        }
        reject(err);
      }
    }

    authWindow.webContents.on("will-navigate", (event, newUrl) => {
      if (newUrl.startsWith(OFFICIAL_MINECRAFT_REDIRECT_URI)) {
        event.preventDefault();
        handleUrl(newUrl);
      }
    });

    authWindow.webContents.on("will-redirect", (event, newUrl) => {
      if (newUrl.startsWith(OFFICIAL_MINECRAFT_REDIRECT_URI)) {
        event.preventDefault();
        handleUrl(newUrl);
      }
    });

    authWindow.webContents.on("did-navigate", (_event, newUrl) => {
      if (newUrl.startsWith(OFFICIAL_MINECRAFT_REDIRECT_URI)) {
        handleUrl(newUrl);
      }
    });

    authWindow.webContents.on("did-redirect-navigation", (_event, newUrl) => {
      if (newUrl.startsWith(OFFICIAL_MINECRAFT_REDIRECT_URI)) {
        handleUrl(newUrl);
      }
    });

    authWindow.on("closed", () => {
      if (!completed) {
        completed = true;
        reject(new Error("Microsoft login window was closed."));
      }
    });

    authWindow.loadURL(loginUrl);
  });
}

async function startMicrosoftLogin(settings) {
  const customClientId = String(settings?.microsoftClientId || "").trim();
  if (customClientId) {
    const device = await postForm("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", {
      client_id: customClientId,
      scope: "XboxLive.signin offline_access"
    });
    const flowId = crypto.randomUUID();
    pendingAuthFlows.set(flowId, {
      clientId: customClientId,
      deviceCode: device.device_code,
      expiresAt: Date.now() + Number(device.expires_in || 900) * 1000,
      interval: Number(device.interval || 5)
    });
    if (device.verification_uri) shell.openExternal(requireHttpsUrl(device.verification_uri, "Microsoft login page"));
    return {
      flowId,
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      message: device.message,
      expiresIn: device.expires_in
    };
  }

  return startMicrosoftLoginInteractive();
}

async function completeMicrosoftLogin(flowId) {
  const flow = pendingAuthFlows.get(flowId);
  if (!flow) throw new Error("Login session expired. Start Microsoft login again.");
  if (Date.now() > flow.expiresAt) {
    pendingAuthFlows.delete(flowId);
    throw new Error("Microsoft login code expired. Start login again.");
  }

  const token = await pollMicrosoftDeviceToken(flow);
  pendingAuthFlows.delete(flowId);
  const account = await createMinecraftAccountFromMicrosoftToken(token);
  const accounts = await readJson(paths.accounts, []);
  const existing = accounts.find((item) => item.uuid === account.uuid);
  const next = existing
    ? accounts.map((item) => (item.uuid === account.uuid ? { ...item, ...account, id: item.id } : item))
    : [...accounts, account];
  await writeJson(paths.accounts, next);
  return next.map(publicAccount);
}

async function pollMicrosoftDeviceToken(flow) {
  const tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    try {
      return await postForm(tokenUrl, {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: flow.clientId,
        device_code: flow.deviceCode
      });
    } catch (error) {
      if (!/authorization_pending|slow_down/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, flow.interval * 1000));
    }
  }
  throw new Error("Still waiting for Microsoft approval. Click Complete Login again after approving the code.");
}

async function createMinecraftAccountFromMicrosoftToken(msToken) {
  const xbox = await postJson("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: `d=${msToken.access_token}`
    },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT"
  });
  const xsts = await postJson("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: {
      SandboxId: "RETAIL",
      UserTokens: [xbox.Token]
    },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT"
  });
  const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs;
  const minecraft = await postJson("https://api.minecraftservices.com/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  });
  try {
    await getJson("https://api.minecraftservices.com/entitlements/mcstore", minecraft.access_token);
  } catch (_e) {}
  const profile = await getJson("https://api.minecraftservices.com/minecraft/profile", minecraft.access_token);
  if (!profile?.id || !profile?.name) {
    throw new Error("This Microsoft account does not appear to own Minecraft Java Edition.");
  }

  return {
    id: `account-${profile.id}`,
    authMode: "microsoft",
    name: profile.name,
    email: "",
    uuid: profile.id,
    xuid: uhs || "",
    skinUrl: profile.skins?.[0]?.url || "",
    instanceId: `account-${profile.name}`,
    token: encryptToken(minecraft.access_token),
    refreshToken: encryptToken(msToken.refresh_token || ""),
    expiresAt: Date.now() + Number(minecraft.expires_in || 86400) * 1000
  };
}

async function startLocalBridge() {
  if (bridgeServer) return;
  bridgeServer = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      const token = request.headers["x-hk-token"] || url.searchParams.get("token");
      if (!safeCompareSecret(token, bridgeToken)) {
        writeBridgeJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (url.pathname === "/logins") {
        writeBridgeJson(response, 200, {
          logins: (await readJson(paths.serverLogins, [])).map(publicServerLogin)
        });
        return;
      }

      if (url.pathname === "/command") {
        const loginId = requireSafeId(url.searchParams.get("id"), "server login id");
        const logins = await readJson(paths.serverLogins, []);
        const login = logins.find((item) => item.id === loginId);
        if (!login) {
          writeBridgeJson(response, 404, { error: "Saved login not found" });
          return;
        }
        writeBridgeJson(response, 200, {
          command: `${login.commandPrefix || "/login"} ${decryptToken(login.password)}`,
          label: login.label,
          serverAddress: login.serverAddress
        });
        return;
      }

      writeBridgeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeBridgeJson(response, 500, { error: error.message });
    }
  });

  await new Promise((resolve) => {
    bridgeServer.listen(0, "127.0.0.1", () => {
      bridgePort = bridgeServer.address().port;
      resolve();
    });
  });
}

function writeBridgeJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function refreshAccountIfNeeded(account, settings) {
  if (account.authMode !== "microsoft") return account;
  if (account.expiresAt && Number(account.expiresAt) > Date.now() + 300_000) return account;
  const refreshToken = decryptToken(account.refreshToken || "");
  if (!refreshToken) return account;
  const customClientId = String(settings.microsoftClientId || "").trim();

  let refreshed;
  if (customClientId) {
    refreshed = await postForm("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      grant_type: "refresh_token",
      client_id: customClientId,
      refresh_token: refreshToken,
      scope: "XboxLive.signin offline_access"
    });
  } else {
    refreshed = await postForm("https://login.live.com/oauth20_token.srf", {
      grant_type: "refresh_token",
      client_id: OFFICIAL_MINECRAFT_CLIENT_ID,
      refresh_token: refreshToken,
      scope: OFFICIAL_MINECRAFT_SCOPE,
      redirect_uri: OFFICIAL_MINECRAFT_REDIRECT_URI
    });
  }

  const nextAccount = await createMinecraftAccountFromMicrosoftToken(refreshed);
  const merged = { ...account, ...nextAccount, id: account.id };
  const accounts = await readJson(paths.accounts, []);
  await writeJson(paths.accounts, accounts.map((item) => (item.id === account.id ? merged : item)));
  return merged;
}

function profileToOptions(profile) {
  const maxFps = Number(profile.fpsCap || 0) > 0 ? Number(profile.fpsCap) : 260;
  return [
    `maxFps:${maxFps}`,
    `renderDistance:${profile.renderDistance}`,
    `simulationDistance:${profile.simulationDistance || 4}`,
    `entityDistanceScaling:${Math.max(0.1, Number(profile.entityDistance || 50) / 100)}`,
    `graphicsMode:${profile.graphicsMode || "fast"}`,
    `particles:${profile.particles}`,
    `clouds:${profile.clouds}`,
    `entityShadows:${profile.entityShadows ? "true" : "false"}`,
    `ao:${profile.smoothLighting ? "true" : "false"}`,
    `biomeBlendRadius:${Number(profile.biomeBlendRadius ?? 0)}`,
    `mipmapLevels:${Number(profile.mipmapLevels ?? 0)}`,
    `enableVsync:${profile.vsync ? "true" : "false"}`,
    `fullscreen:${profile.fullscreen ? "true" : "false"}`,
    "pauseOnLostFocus:false"
  ].join("\n");
}

async function prepareInstance(account, profile) {
  const instanceId = getInstanceDirName(account, profile);
  const gameDir = path.join(paths.instances, instanceId);
  await fs.mkdir(gameDir, { recursive: true });
  await fs.mkdir(path.join(gameDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "config"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "mods"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "resourcepacks"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "shaderpacks"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(gameDir, "saves"), { recursive: true });
  if (profile.id === sharedProfileId) {
    await syncSharedContentToInstance(gameDir);
  }
  await installBundledClientMods(profile, gameDir);
  await fs.writeFile(path.join(gameDir, "options.txt"), `${profileToOptions(profile)}\n`, "utf8");
  return gameDir;
}

function getInstanceDirName(account, profile) {
  if (profile.id === sharedProfileId) {
    return sanitizePathSegment(account.instanceId || account.id || account.name || "account");
  }
  return sanitizePathSegment(profile.gameDirName || account.instanceId || account.id || account.name || "profile");
}

function sanitizePathSegment(value) {
  const clean = String(value || "profile")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\.\.+/g, ".")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "profile";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean) ? `_${clean}` : clean;
}

async function syncSharedContentToInstance(gameDir) {
  const sharedDir = path.join(paths.instances, sharedProfileDefaults.gameDirName);
  for (const folderName of ["mods", "resourcepacks", "shaderpacks"]) {
    const sourceDir = path.join(sharedDir, folderName);
    const targetDir = path.join(gameDir, folderName);
    if (!fss.existsSync(sourceDir) || path.resolve(sourceDir) === path.resolve(targetDir)) continue;
    await fs.mkdir(targetDir, { recursive: true });
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      const source = path.join(sourceDir, entry.name);
      const target = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await fs.cp(source, target, { recursive: true, force: true });
      } else if (entry.isFile()) {
        await fs.copyFile(source, target);
      }
    }
  }
}

async function installBundledClientMods(profile, gameDir) {
  if ((profile.modloader || "vanilla") !== "fabric") return;
  const modJar = path.join(rootDir, "minecraft-client-mod", "build", "libs", "hk-client-tools-0.1.0.jar");
  if (!fss.existsSync(modJar)) return;
  await fs.copyFile(modJar, path.join(gameDir, "mods", "hk-client-tools-0.1.0.jar"));
}

async function getVersionManifest() {
  const manifestPath = path.join(paths.sharedMinecraft, "version_manifest_v2.json");
  try {
    const { data } = await offlineCache.fetchWithCache(versionManifestUrl, "version_manifest_v2", 3500);
    await writeJson(manifestPath, data);
    return data;
  } catch (error) {
    const cached = await readJson(manifestPath, null);
    if (cached) return cached;
    return offlineCache.generateLocalFallbackManifest();
  }
}

async function getAvailableVersions() {
  const manifest = await getVersionManifest();
  const installed = new Set(await getInstalledVersions());
  return {
    latest: manifest.latest,
    versions: manifest.versions.map((version) => ({
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime,
      installed: installed.has(version.id)
    }))
  };
}

async function getInstalledVersions() {
  const versionsDir = path.join(paths.sharedMinecraft, "versions");
  await fs.mkdir(versionsDir, { recursive: true });
  const entries = await fs.readdir(versionsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((versionId) => fss.existsSync(versionInstallMarker(versionId)));
}

async function resolveRequestedVersion(settings, progress = () => {}) {
  const requested = settings.minecraftVersionId || settings.fabricVersionId || "latest-release";
  if (requested === "latest-compatible") {
    return getLatestCompatibleVersion(settings, "release", progress);
  }
  let resolved = requested;
  if (requested === "latest-release" || requested === "latest-snapshot") {
    const manifest = await getVersionManifest();
    resolved = requested === "latest-snapshot" ? manifest.latest.snapshot : manifest.latest.release;
  }
  return ensureJavaCompatibleMinecraftVersion(resolved, settings, progress);
}

async function getLatestCompatibleVersion(settings, type = "release", progress = () => {}) {
  const manifest = await getVersionManifest();
  const maxJava = getMaxAvailableJavaMajor(settings.javaPath);
  progress({
    versionId: "latest-compatible",
    percent: 1,
    message: `Finding newest ${type} for Java ${maxJava}`
  });
  let checked = 0;
  for (const version of manifest.versions) {
    if (version.type !== type) continue;
    checked += 1;
    if (checked % 3 === 1) {
      progress({
        versionId: "latest-compatible",
        percent: Math.min(12, checked + 1),
        message: `Checking ${version.id} for Java ${maxJava}`
      });
    }
    const versionJson = await getVersionJsonForRequirement(version);
    const requiredJava = versionJson.javaVersion?.majorVersion || inferJavaMajor(version.id);
    if (requiredJava <= maxJava) {
      progress({
        versionId: version.id,
        percent: 12,
        message: `Selected ${version.id} for Java ${maxJava}`
      });
      return version.id;
    }
  }
  throw new Error(`No ${type} version is compatible with detected Java ${maxJava}. Install a newer Java or choose an older version manually.`);
}

async function ensureJavaCompatibleMinecraftVersion(versionId, settings, progress = () => {}) {
  const maxJava = getMaxAvailableJavaMajor(settings.javaPath);
  if (!maxJava) return versionId;
  const versionJson = await getVersionJsonById(versionId);
  const requiredJava = versionJson.javaVersion?.majorVersion || inferJavaMajor(versionId);
  if (requiredJava <= maxJava) return versionId;
  progress({
    versionId,
    percent: 2,
    message: `${versionId} needs Java ${requiredJava}; choosing a compatible version for Java ${maxJava}`
  });
  return getLatestCompatibleVersion(settings, "release", progress);
}

async function getVersionJsonById(versionId) {
  const localPath = path.join(paths.sharedMinecraft, "versions", versionId, `${versionId}.json`);
  const local = await readJson(localPath, null);
  if (local) return local;
  const manifest = await getVersionManifest();
  const versionInfo = manifest.versions.find((version) => version.id === versionId);
  if (!versionInfo) throw new Error(`Unknown Minecraft version: ${versionId}`);
  return getVersionJsonForRequirement(versionInfo);
}

async function getVersionJsonForRequirement(versionInfo) {
  const localPath = path.join(paths.sharedMinecraft, "versions", versionInfo.id, `${versionInfo.id}.json`);
  const local = await readJson(localPath, null);
  if (local) return local;
  return downloadJson(versionInfo.url);
}

async function installVersion(versionId, progress = () => {}) {
  const report = (percent, message) => progress({
    versionId,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    message
  });
  report(1, `Finding ${versionId}`);
  const manifest = await getVersionManifest();
  const versionInfo = manifest.versions.find((version) => version.id === versionId);
  if (!versionInfo) throw new Error(`Unknown Minecraft version: ${versionId}`);

  const versionDir = path.join(paths.sharedMinecraft, "versions", versionId);
  const versionJsonPath = path.join(versionDir, `${versionId}.json`);
  report(4, "Downloading version metadata");
  await downloadFile(versionInfo.url, versionJsonPath, report, 4, 8, "version metadata", { sha1: versionInfo.sha1 });
  const versionJson = await readJson(versionJsonPath, null);
  if (!versionJson) throw new Error(`Version metadata for ${versionId} could not be read.`);
  report(8, "Version metadata ready");

  const clientDownload = versionJson.downloads?.client;
  if (clientDownload?.url) {
    await downloadFile(clientDownload.url, path.join(versionDir, `${versionId}.jar`), report, 8, 25, "client.jar", {
      sha1: clientDownload.sha1,
      size: clientDownload.size
    });
  }

  await downloadLibraries(versionJson, report, 25, 55);
  await downloadAssets(versionJson, report, 55, 95);
  report(96, "Extracting native libraries");
  await extractNatives(versionJson, versionId);
  await writeJson(path.join(versionDir, ".hk-installed.json"), {
    versionId,
    installedAt: new Date().toISOString()
  });
  report(100, `${versionId} installed`);
  return { versionId, installed: true };
}

async function installFabricVersion(gameVersion, progress = () => {}) {
  const report = (percent, message) => progress({
    versionId: gameVersion,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    message
  });
  const cachedVersionId = await findInstalledFabricVersion(gameVersion);
  if (cachedVersionId && fss.existsSync(versionInstallMarker(gameVersion))) {
    report(100, `${cachedVersionId} already installed`);
    return cachedVersionId;
  }

  report(1, `Finding Fabric loader for ${gameVersion}`);
  const loaderList = await downloadJson(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`);
  const latest = loaderList.find((item) => item.loader?.stable) || loaderList[0];
  if (!latest?.loader?.version) throw new Error(`No Fabric loader found for ${gameVersion}`);

  await installVersion(gameVersion, ({ percent, message }) => report(percent * 0.75, message));
  report(77, "Downloading Fabric profile");
  const profileJson = await downloadJson(
    `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${latest.loader.version}/profile/json`
  );
  const versionId = profileJson.id || `fabric-loader-${latest.loader.version}-${gameVersion}`;
  const versionDir = path.join(paths.sharedMinecraft, "versions", versionId);
  await writeJson(path.join(versionDir, `${versionId}.json`), profileJson);
  await downloadLibraries(profileJson, (percent, message) => report(78 + percent * 0.2, message), 0, 100);
  await writeJson(path.join(versionDir, ".hk-installed.json"), {
    versionId,
    loader: "fabric",
    gameVersion,
    installedAt: new Date().toISOString()
  });
  report(100, `${versionId} installed`);
  return versionId;
}

async function findInstalledFabricVersion(gameVersion) {
  const versionsDir = path.join(paths.sharedMinecraft, "versions");
  if (!fss.existsSync(versionsDir)) return "";
  const entries = await fs.readdir(versionsDir, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const versionId = entry.name;
    if (!fss.existsSync(versionInstallMarker(versionId))) continue;
    const marker = await readJson(versionInstallMarker(versionId), null);
    if (marker?.loader === "fabric" && marker?.gameVersion === gameVersion) {
      candidates.push({ versionId, installedAt: marker.installedAt || "" });
      continue;
    }
    const json = await readJson(path.join(versionsDir, versionId, `${versionId}.json`), null);
    if (json?.inheritsFrom === gameVersion && /fabric/i.test(versionId)) {
      candidates.push({ versionId, installedAt: marker?.installedAt || "" });
    }
  }
  return candidates.sort((a, b) => b.installedAt.localeCompare(a.installedAt))[0]?.versionId || "";
}

function versionInstallMarker(versionId) {
  return path.join(paths.sharedMinecraft, "versions", versionId, ".hk-installed.json");
}

async function readVersionTree(versionId, seen = new Set()) {
  if (seen.has(versionId)) throw new Error(`Circular version inheritance at ${versionId}`);
  seen.add(versionId);

  const versionJsonPath = path.join(paths.sharedMinecraft, "versions", versionId, `${versionId}.json`);
  const current = await readJson(versionJsonPath, null);
  if (!current) throw new Error(`Version is not installed: ${versionId}`);

  const currentWithJar = { ...current, _jarVersionIds: [versionId] };
  if (!current.inheritsFrom) return currentWithJar;
  const parent = await readVersionTree(current.inheritsFrom, seen);
  return mergeVersionJson(parent, currentWithJar);
}

function mergeVersionJson(parent, child) {
  return {
    ...parent,
    ...child,
    arguments: {
      game: [...(parent.arguments?.game || []), ...(child.arguments?.game || [])],
      jvm: [...(parent.arguments?.jvm || []), ...(child.arguments?.jvm || [])]
    },
    libraries: [...(parent.libraries || []), ...(child.libraries || [])],
    downloads: { ...(parent.downloads || {}), ...(child.downloads || {}) },
    assetIndex: child.assetIndex || parent.assetIndex,
    assets: child.assets || parent.assets,
    mainClass: child.mainClass || parent.mainClass,
    _jarVersionIds: [...(parent._jarVersionIds || []), ...(child._jarVersionIds || [])]
  };
}

async function downloadLibraries(versionJson, progress = () => {}, progressStart = 0, progressEnd = 100) {
  const downloads = [];
  for (const library of versionJson.libraries || []) {
    if (!libraryAllowed(library)) continue;
    const artifact = library.downloads?.artifact;
    if (artifact?.url && artifact.path) {
      downloads.push({
        url: artifact.url,
        filePath: path.join(paths.sharedMinecraft, "libraries", artifact.path),
        label: path.basename(artifact.path),
        expected: { sha1: artifact.sha1, size: artifact.size }
      });
    } else if (library.name && library.url) {
      const artifactPath = mavenPath(library.name);
      downloads.push({
        url: `${library.url.replace(/\/$/, "")}/${artifactPath.replace(/\\/g, "/")}`,
        filePath: path.join(paths.sharedMinecraft, "libraries", artifactPath),
        label: path.basename(artifactPath),
        expected: {}
      });
    }

    const native = getNativeArtifact(library);
    if (native?.url && native.path) {
      downloads.push({
        url: native.url,
        filePath: path.join(paths.sharedMinecraft, "libraries", native.path),
        label: path.basename(native.path),
        expected: { sha1: native.sha1, size: native.size }
      });
    }
  }

  if (!downloads.length) {
    progress(progressEnd, "No libraries required");
    return;
  }

  for (let index = 0; index < downloads.length; index += 1) {
    const item = downloads[index];
    const start = progressStart + ((progressEnd - progressStart) * index) / downloads.length;
    const end = progressStart + ((progressEnd - progressStart) * (index + 1)) / downloads.length;
    await downloadFile(item.url, item.filePath, progress, start, end, `library ${index + 1}/${downloads.length}`, item.expected);
  }
}

async function downloadAssets(versionJson, progress = () => {}, progressStart = 0, progressEnd = 100) {
  const assetIndex = versionJson.assetIndex;
  if (!assetIndex?.url) {
    progress(progressEnd, "No assets required");
    return;
  }

  const indexesDir = path.join(paths.sharedMinecraft, "assets", "indexes");
  const objectsDir = path.join(paths.sharedMinecraft, "assets", "objects");
  const indexPath = path.join(indexesDir, `${assetIndex.id}.json`);
  await downloadFile(assetIndex.url, indexPath, progress, progressStart, progressStart + 3, "asset index", {
    sha1: assetIndex.sha1,
    size: assetIndex.size
  });

  const index = await readJson(indexPath, null);
  const objects = Object.values(index?.objects || {});
  if (!objects.length) {
    progress(progressEnd, "No asset objects listed");
    return;
  }

  for (let itemIndex = 0; itemIndex < objects.length; itemIndex += 1) {
    const object = objects[itemIndex];
    const hash = object.hash;
    if (!hash) continue;
    const objectPath = path.join(objectsDir, hash.slice(0, 2), hash);
    const start = progressStart + 3 + ((progressEnd - progressStart - 3) * itemIndex) / objects.length;
    const end = progressStart + 3 + ((progressEnd - progressStart - 3) * (itemIndex + 1)) / objects.length;
    const shouldEmit = itemIndex % 20 === 0 || itemIndex === objects.length - 1 || !fss.existsSync(objectPath);
    await downloadFile(
      `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
      objectPath,
      shouldEmit ? progress : () => {},
      start,
      end,
      `asset ${itemIndex + 1}/${objects.length}`,
      { sha1: hash, size: object.size }
    );
  }
}

async function extractNatives(versionJson, versionId) {
  const nativeDir = path.join(paths.sharedMinecraft, "versions", versionId, "natives");
  await fs.mkdir(nativeDir, { recursive: true });

  for (const library of versionJson.libraries || []) {
    if (!libraryAllowed(library)) continue;
    const native = getNativeArtifact(library);
    if (!native?.path) continue;
    const nativePath = path.join(paths.sharedMinecraft, "libraries", native.path);
    if (!fss.existsSync(nativePath)) continue;

    const zip = new AdmZip(nativePath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName;
      if (name.startsWith("META-INF/")) continue;
      if (!/\.(dll|so|dylib)$/i.test(name)) continue;
      zip.extractEntryTo(entry, nativeDir, false, true);
    }
  }
}

async function buildMinecraftCommand({ account, profile, settings, progress = () => {} }) {
  const versionId = await resolveProfileVersion(profile, settings, progress);
  const versionJsonPath = path.join(
    paths.sharedMinecraft,
    "versions",
    versionId,
    `${versionId}.json`
  );

  if (!fss.existsSync(versionJsonPath) || !fss.existsSync(versionInstallMarker(versionId))) {
    await installVersion(versionId, progress);
  }

  const versionJson = await readVersionTree(versionId);
  const mainClass = versionJson.mainClass || "net.minecraft.client.main.Main";
  const classpath = collectClasspath(versionJson, versionId);
  const gameDir = await prepareInstance(account, profile);
  const isLocal = account.authMode === "local";
  const accessToken = isLocal ? "offline" : decryptToken(account.token);
  const uuid = account.uuid || (isLocal ? offlineUuid(account.name) : "00000000000000000000000000000000");
  const nativesDir = path.join(paths.sharedMinecraft, "versions", versionId, "natives");
  const jvmArgs = splitArgs(profile.jvmArgs);
  const javaPath = selectJavaExecutable(versionJson, versionId, settings.javaPath);
  await ensureNativeLibraries(versionJson, versionId);

  if (!isLocal && !accessToken) {
    throw new Error("Auth expired or missing. Please login with Microsoft again.");
  }

  const replacements = {
    auth_player_name: account.name,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: path.join(paths.sharedMinecraft, "assets"),
    assets_index_name: versionJson.assetIndex?.id || versionJson.assets || "legacy",
    auth_uuid: uuid,
    auth_access_token: accessToken,
    clientid: account.clientId || "",
    auth_xuid: account.xuid || "",
    user_type: isLocal ? "legacy" : "msa",
    version_type: versionJson.type || "release",
    natives_directory: nativesDir,
    launcher_name: "HKLauncher",
    launcher_version: "0.1.0",
    classpath,
    resolution_width: String(profile.width),
    resolution_height: String(profile.height)
  };

  const gameArgs = buildGameArgs(versionJson, replacements, settings, profile);
  const builtJvmArgs = buildJvmArgs(versionJson, replacements);

  return {
    command: javaPath,
    args: [
      ...jvmArgs,
      `-Dhk.bridge.port=${bridgePort}`,
      `-Dhk.bridge.token=${bridgeToken}`,
      `-Xmx${profile.ramMb}M`,
      `-Xms512M`,
      ...builtJvmArgs,
      mainClass,
      ...gameArgs
    ],
    gameDir
  };
}

async function resolveProfileVersion(profile, settings, progress = () => {}) {
  const baseVersion = await resolveRequestedVersion({
    ...settings,
    minecraftVersionId: profile.minecraftVersionId || settings.minecraftVersionId
  }, progress);
  const modloader = profile.modloader || "vanilla";
  if (modloader === "vanilla") return baseVersion;
  if (modloader === "fabric") return installFabricVersion(baseVersion, progress);
  throw new Error(`${modloader} profile support is scaffolded, but its installer is not wired yet. Use Vanilla or Fabric for now.`);
}

function collectClasspath(versionJson, versionId) {
  const libraries = (versionJson.libraries || [])
    .filter(libraryAllowed)
    .map(libraryArtifactPath)
    .filter(Boolean)
    .map((artifactPath) => path.join(paths.sharedMinecraft, "libraries", artifactPath));

  const jarVersionIds = [...new Set([...(versionJson._jarVersionIds || []), versionId])];
  for (const jarVersionId of jarVersionIds) {
    const jarPath = path.join(paths.sharedMinecraft, "versions", jarVersionId, `${jarVersionId}.jar`);
    if (fss.existsSync(jarPath)) libraries.push(jarPath);
  }
  return libraries.join(path.delimiter);
}

async function ensureNativeLibraries(versionJson, versionId) {
  const nativeDir = path.join(paths.sharedMinecraft, "versions", versionId, "natives");
  if (await directoryHasNativeFiles(nativeDir)) return;
  await extractNatives(versionJson, versionId);
  if (await directoryHasNativeFiles(nativeDir)) return;
  await copyInheritedNativeLibraries(versionJson, versionId, nativeDir);
  if (!(await directoryHasNativeFiles(nativeDir))) {
    throw new Error(`Native libraries were not extracted for ${versionId}. Repair or reinstall this version.`);
  }
}

async function copyInheritedNativeLibraries(versionJson, versionId, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const inheritedVersionIds = [...new Set(versionJson._jarVersionIds || [])].filter((item) => item && item !== versionId);
  for (const inheritedVersionId of inheritedVersionIds) {
    const sourceDir = path.join(paths.sharedMinecraft, "versions", inheritedVersionId, "natives");
    if (!(await directoryHasNativeFiles(sourceDir))) continue;
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(dll|dll\.x|so|dylib)$/i.test(entry.name)) continue;
      await fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
    }
    if (await directoryHasNativeFiles(targetDir)) return;
  }
}

async function directoryHasNativeFiles(nativeDir) {
  try {
    const entries = await fs.readdir(nativeDir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && /\.(dll|so|dylib)$/i.test(entry.name));
  } catch {
    return false;
  }
}

function libraryArtifactPath(library) {
  return library.downloads?.artifact?.path || (library.name ? mavenPath(library.name) : "");
}

function mavenPath(name) {
  const [group, artifact, version] = String(name).split(":");
  if (!group || !artifact || !version) return "";
  return path.join(...group.split("."), artifact, version, `${artifact}-${version}.jar`);
}

function selectJavaExecutable(versionJson, versionId, preferredJavaPath) {
  const requiredMajor = versionJson.javaVersion?.majorVersion || javaManager.getRequiredJavaMajor(versionId);
  const runtimeDir = path.join(paths.launcherData, "runtime");
  const detected = javaManager.detectJavaInstallations({
    customPaths: preferredJavaPath ? [preferredJavaPath] : [],
    runtimeDir
  });

  const best = javaManager.selectBestJava(requiredMajor, preferredJavaPath, detected);
  if (best && best.major >= requiredMajor) {
    return best.path;
  }

  const detectedSummary = detected.map((j) => `${j.name} (Java ${j.major})`).join(", ") || "None";
  throw new Error(`Java compatibility error: Minecraft ${versionId} requires Java ${requiredMajor} or newer. Detected on this PC: ${detectedSummary}. You can install Java ${requiredMajor} automatically from Launcher Settings -> Java Runtime.`);
}

function getMaxAvailableJavaMajor(preferredJavaPath) {
  const preferredMajor = getJavaMajor(preferredJavaPath || "java");
  const installed = javaCandidates.filter((candidate) => fss.existsSync(candidate.path));
  const majors = installed.map((candidate) => candidate.major);
  if (preferredMajor) majors.push(preferredMajor);
  const systemMajor = getJavaMajor("java");
  if (systemMajor) majors.push(systemMajor);
  return majors.length ? Math.max(...majors) : 0;
}

function getJavaMajor(javaPath = "java") {
  if (!javaPath) return 0;
  const known = javaCandidates.find((candidate) => candidate.path === javaPath && (javaPath === "java" || fss.existsSync(candidate.path)));
  if (known) return known.major;
  return probeJavaMajor(javaPath);
}

function probeJavaMajor(javaPath = "java") {
  try {
    const result = spawnSync(javaPath, ["-version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2500
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const version = output.match(/version\s+"([^"]+)"/i)?.[1] || output.match(/openjdk\s+([^ \r\n]+)/i)?.[1] || "";
    const legacy = version.match(/^1\.(\d+)/);
    if (legacy) return Number(legacy[1]);
    const modern = version.match(/^(\d+)/);
    return modern ? Number(modern[1]) : 0;
  } catch {
    return 0;
  }
}

function inferJavaMajor(versionId) {
  const match = String(versionId).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const minor = Number(match[2]);
  const patch = Number(match[3] || 0);
  if (minor >= 21) return 21;
  if (minor === 20 && patch >= 5) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

function getNativeArtifact(library) {
  const classifier = library.natives?.windows?.replace("${arch}", process.arch === "x64" ? "64" : "32");
  return classifier ? library.downloads?.classifiers?.[classifier] : null;
}

function libraryAllowed(library) {
  return rulesAllowed(library.rules);
}

function rulesAllowed(rules) {
  if (!rules?.length) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule)) allowed = rule.action === "allow";
  }
  return allowed;
}

function ruleMatches(rule) {
  if (rule.features) return false;
  if (!rule.os) return true;
  if (rule.os.name && rule.os.name !== "windows") return false;
  if (rule.os.arch && rule.os.arch !== process.arch) return false;
  return true;
}

function buildGameArgs(versionJson, replacements, settings, profile) {
  let args = [];
  if (versionJson.arguments?.game) {
    args = expandArgumentList(versionJson.arguments.game, replacements);
  } else if (versionJson.minecraftArguments) {
    args = replaceTokens(versionJson.minecraftArguments, replacements).split(" ");
  }

  args.push("--width", String(profile.width), "--height", String(profile.height));
  if (settings.serverIp) args.push("--server", settings.serverIp);
  return args;
}

function buildJvmArgs(versionJson, replacements) {
  if (versionJson.arguments?.jvm) {
    const args = expandArgumentList(versionJson.arguments.jvm, replacements);
    return args.length ? args : defaultJvmArgs(replacements);
  }
  return defaultJvmArgs(replacements);
}

function defaultJvmArgs(replacements) {
  return [
    `-Djava.library.path=${replacements.natives_directory}`,
    "-Dminecraft.launcher.brand=HKLauncher",
    "-Dminecraft.launcher.version=0.1.0",
    "-cp",
    replacements.classpath
  ];
}

function expandArgumentList(items, replacements) {
  const args = [];
  for (const item of items || []) {
    if (typeof item === "string") {
      args.push(replaceTokens(item, replacements));
      continue;
    }
    if (item.rules && !rulesAllowed(item.rules)) continue;
    const values = Array.isArray(item.value) ? item.value : [item.value];
    for (const value of values.filter(Boolean)) args.push(replaceTokens(value, replacements));
  }
  return args;
}

function replaceTokens(value, replacements) {
  return String(value).replace(/\$\{([^}]+)\}/g, (_match, key) => replacements[key] ?? "");
}

function splitArgs(value) {
  return String(value || "")
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((arg) => arg.replace(/^"|"$/g, "")) || [];
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(new RegExp(bridgeToken, "g"), "[redacted-bridge-token]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/((?:access|refresh|client|session|auth)[_-]?token["'=:\s]+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/(XBL3\.0 x=[^;]+;)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 8000);
}

async function appendLog(accountId, text) {
  await fs.mkdir(paths.logs, { recursive: true });
  const safeAccountId = requireSafeId(accountId, "account id");
  const logPath = assertInsideDirectory(paths.logs, path.join(paths.logs, `${safeAccountId}.log`));
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${redactSensitiveText(text)}\n`, "utf8");
}

async function launchAccount({ accountId }, progress = () => {}) {
  const safeAccountId = requireSafeId(accountId, "account id");
  if (runningProcesses.has(safeAccountId)) {
    throw new Error("This account already has a running Minecraft process.");
  }

  const accounts = await readJson(paths.accounts, []);
  let settings = { ...(await readSettings()), smartFpsEnabled: true };
  const report = await buildFpsOptimizerReport(settings.optimizerPresetId || "");
  settings = { ...settings, ...report.recommendation.recommended, smartFpsEnabled: true };
  const overrides = await readJson(paths.accountOverrides, {});
  const account = accounts.find((item) => item.id === safeAccountId);
  const profile = applyAccountOverride(getSharedLaunchProfile(settings), overrides[safeAccountId]);
  const effectiveSettings = profile.javaPath ? { ...settings, javaPath: profile.javaPath } : settings;

  if (!account) throw new Error("Account not found.");

  const launchAccountProfile = await refreshAccountIfNeeded(account, effectiveSettings);
  const launch = await buildMinecraftCommand({ account: launchAccountProfile, profile, settings: effectiveSettings, progress });
  await appendLog(launchAccountProfile.id, `Launching ${launchAccountProfile.name} with ${profile.name} (${launchAccountProfile.authMode || "microsoft"})`);

  const child = spawn(launch.command, launch.args, {
    cwd: launch.gameDir,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  runningProcesses.set(launchAccountProfile.id, {
    child,
    accountId: launchAccountProfile.id,
    accountName: launchAccountProfile.name,
    profile,
    gameDir: launch.gameDir,
    startedAt: new Date().toISOString()
  });
  child.stdout.on("data", (data) => appendLog(launchAccountProfile.id, data.toString().trim()));
  child.stderr.on("data", (data) => appendLog(launchAccountProfile.id, data.toString().trim()));
  child.on("error", (error) => {
    runningProcesses.delete(launchAccountProfile.id);
    appendLog(launchAccountProfile.id, `Launch failed: ${friendlyLaunchError(error.message)}`);
  });
  child.on("exit", (code, signal) => {
    runningProcesses.delete(launchAccountProfile.id);
    appendLog(launchAccountProfile.id, `Exited with code ${code ?? "null"} signal ${signal ?? "null"}`);
    summarizeLatestCrash(launch.gameDir).then((summary) => {
      if (summary) appendLog(launchAccountProfile.id, `Crash summary: ${summary}`);
    });
  });

  await waitForInitialLaunch(child, launchAccountProfile.id, launch.gameDir);

  if (settings.closeLauncherAfterLaunch) {
    setTimeout(() => app.quit(), 1200);
  }

  return { pid: child.pid, accountId: launchAccountProfile.id };
}

function waitForInitialLaunch(child, accountId, gameDir, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => {
      finish(new Error(friendlyLaunchError(error.message)));
    };
    const onExit = async (code, signal) => {
      const summary = await summarizeLatestCrash(gameDir).catch(() => "");
      const suffix = summary ? ` ${summary}` : "Open Logs to see the latest Minecraft output.";
      finish(new Error(`Minecraft closed before the window opened. Exit code ${code ?? "null"}, signal ${signal ?? "null"}. ${suffix}`));
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    child.once("error", onError);
    child.once("exit", onExit);
  }).catch(async (error) => {
    await appendLog(accountId, `Initial launch check failed: ${error.message}`);
    throw error;
  });
}

function getRunningInstances() {
  return Array.from(runningProcesses.values()).map((entry) => ({
    accountId: entry.accountId,
    accountName: entry.accountName,
    pid: entry.child.pid,
    startedAt: entry.startedAt,
    version: entry.profile.minecraftVersionId || "latest-compatible",
    loader: entry.profile.modloader || "vanilla",
    ramMb: entry.profile.ramMb,
    fpsCap: entry.profile.fpsCap,
    width: entry.profile.width,
    height: entry.profile.height,
    renderDistance: entry.profile.renderDistance,
    gameDir: entry.gameDir,
    status: "Running"
  }));
}

function runWindowPowerShell(pid, action) {
  if (process.platform !== "win32") return false;
  const script = action === "focus"
    ? `$shell = New-Object -ComObject WScript.Shell; $shell.AppActivate(${Number(pid)}) | Out-Null`
    : `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) { [Win32]::ShowWindowAsync($p.MainWindowHandle, 6) | Out-Null }`;
  spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    stdio: "ignore"
  }).unref();
  return true;
}

async function summarizeLatestCrash(gameDir) {
  const crashDir = path.join(gameDir, "crash-reports");
  if (!fss.existsSync(crashDir)) return "";
  const files = (await fs.readdir(crashDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
    .map((entry) => path.join(crashDir, entry.name))
    .sort((a, b) => fss.statSync(b).mtimeMs - fss.statSync(a).mtimeMs);
  if (!files.length) return "";
  const text = await fs.readFile(files[0], "utf8");
  const description = text.match(/Description:\s*(.+)/)?.[1]?.trim();
  const exception = text.match(/\n([a-zA-Z0-9_.]+(?:Exception|Error):[^\n]+)/)?.[1]?.trim();
  return [description, exception].filter(Boolean).join(" - ");
}

async function analyzeCrash(accountId) {
  const safeAccountId = requireSafeId(accountId, "account id");
  const accounts = await readJson(paths.accounts, []);
  const account = accounts.find((item) => item.id === safeAccountId);
  const settings = await readSettings();
  const profile = getSharedLaunchProfile(settings);
  const gameDir = account ? path.join(paths.instances, getInstanceDirName(account, profile)) : paths.instances;
  assertInsideDirectory(paths.instances, gameDir);
  const logPath = assertInsideDirectory(paths.logs, path.join(paths.logs, `${safeAccountId}.log`));
  const crashDir = path.join(gameDir, "crash-reports");
  const chunks = [];
  if (fss.existsSync(logPath)) chunks.push(await fs.readFile(logPath, "utf8"));
  if (fss.existsSync(crashDir)) {
    const files = (await fs.readdir(crashDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
      .map((entry) => path.join(crashDir, entry.name))
      .sort((a, b) => fss.statSync(b).mtimeMs - fss.statSync(a).mtimeMs);
    if (files[0]) chunks.push(await fs.readFile(files[0], "utf8"));
  }
  const text = chunks.join("\n");
  const findings = crashRules()
    .filter((rule) => rule.pattern.test(text))
    .map(({ problem, fix }) => ({ problem, fix }));
  return {
    accountId: safeAccountId,
    gameDir,
    findings: findings.length ? findings : [{ problem: text ? "No common crash pattern detected." : "No crash/log text found.", fix: text ? "Open the full log and inspect the latest error." : "Launch once, then check logs again." }],
    summary: await summarizeLatestCrash(gameDir)
  };
}

function crashRules() {
  return [
    { pattern: /UnsupportedClassVersionError|wrong java|java version/i, problem: "Wrong Java version", fix: "Install the Java version required by this Minecraft version, then launch again." },
    { pattern: /fabric api|net\.fabricmc\.fabric/i, problem: "Fabric API may be missing or incompatible", fix: "Install the matching Fabric API jar for the selected Minecraft version." },
    { pattern: /OutOfMemoryError|Java heap space/i, problem: "Out of memory", fix: "Use Extreme Performance defaults, reduce render distance, or lower RAM if Windows is under pressure." },
    { pattern: /ModResolutionException|DuplicateModsFound|Conflicting versions/i, problem: "Mod conflict or duplicate mod", fix: "Run the Mod Compatibility Checker and remove duplicates or wrong-version mods." },
    { pattern: /OpenGL|GLFW|driver/i, problem: "Graphics/OpenGL driver issue", fix: "Update GPU drivers or reduce graphics settings." },
    { pattern: /Invalid session|authentication|access token/i, problem: "Authentication/session issue", fix: "Refresh or re-login the Microsoft account." },
    { pattern: /timed out|Connection reset|Disconnected/i, problem: "Server connection timeout", fix: "Use Server Health Panel to check ping, DNS, and server status." }
  ];
}

function friendlyLaunchError(message) {
  if (/ENOENT|not recognized|java/i.test(message)) {
    return "Java could not be started. Install the Java version required by the selected Minecraft version, then launch again.";
  }
  if (/access token|Auth expired|login/i.test(message)) {
    return "Microsoft session expired. Login again from Accounts.";
  }
  if (/Missing version|Version is not installed|damaged/i.test(message)) {
    return "Version files are missing or damaged. Use Versions > Install/Repair.";
  }
  return message;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 880,
    minHeight: 600,
    title: "HK Launcher",
    frame: false,
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== trustedRendererUrl) event.preventDefault();
  });
  win.webContents.on("before-input-event", (event, input) => {
    const opensDevTools = input.key === "F12" || (input.control && input.shift && ["I", "J", "C"].includes(input.key.toUpperCase()));
    if (app.isPackaged && opensDevTools) event.preventDefault();
  });
  win.webContents.on("devtools-opened", () => {
    if (app.isPackaged) win.webContents.closeDevTools();
  });
  win.loadFile(rendererIndexPath);
}

async function buildFpsOptimizerReport(requestedPresetId = "") {
  const settings = await readSettings();
  const profile = getSharedLaunchProfile(settings);
  const accounts = (await readJson(paths.accounts, [])).map(publicAccount);
  const display = screen.getPrimaryDisplay();
  const javaInstallations = getJavaInstallations();
  const content = await listProfileContent(sharedProfileId);
  const modAnalysis = await analyzeMods(sharedProfileId);
  const hardware = await scanHardware({
    rootDir,
    javaInstallations,
    screenInfo: {
      width: display.size.width,
      height: display.size.height,
      scaleFactor: display.scaleFactor,
      refreshRate: display.displayFrequency || display.frequency || null
    }
  });
  const analysis = analyzeSettings({ settings, profile, content, modAnalysis, hardware });
  const recommendation = buildRecommendations({ hardware, analysis, accounts, settings, requestedPresetId });
  return buildOptimizerViewModel({ hardware, analysis, recommendation });
}

async function saveOptimizerBaseline(settings, accountOverrides) {
  if (fss.existsSync(paths.optimizerBaseline)) return;
  await writeJson(paths.optimizerBaseline, {
    savedAt: new Date().toISOString(),
    settings,
    accountOverrides
  });
}

function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event);
    return handler(event, ...args);
  });
}

function assertTrustedIpcSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  const cleanSenderUrl = String(senderUrl || "").split("#")[0];
  if (cleanSenderUrl !== trustedRendererUrl) {
    throw new Error("Blocked IPC call from an untrusted renderer.");
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await ensureLayout();
  await startLocalBridge();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

secureHandle("app:load", async () => {
  const settings = await readSettings();
  return {
    accounts: (await readJson(paths.accounts, [])).map(publicAccount),
    accountOverrides: await readJson(paths.accountOverrides, {}),
    savedServers: await readJson(paths.savedServers, []),
    profiles: [getSharedLaunchProfile(settings)],
    settings,
    running: Array.from(runningProcesses.keys()),
    runningInstances: getRunningInstances(),
    javaInstallations: getJavaInstallations(),
    modSuggestions,
    setupPresets,
    performanceModes,
    optimizerPresets,
    advancedModes,
    performancePackMods,
    downloadEvents,
    paths
  };
});

secureHandle("settings:save", async (_event, settings) => {
  const next = sanitizeSettings({ ...defaultSettings, ...settings });
  await writeJson(paths.settings, next);
  return next;
});

secureHandle("settings:applyPreset", async (_event, presetId) => {
  const safePresetId = requireSafeId(presetId, "preset id");
  const preset = [...setupPresets, ...performanceModes].find((item) => item.id === safePresetId);
  if (!preset) throw new Error("Preset not found.");
  const settings = await readSettings();
  const next = sanitizeSettings({ ...settings, ...preset.settings });
  await writeJson(paths.settings, next);
  return next;
});

secureHandle("overrides:save", async (_event, accountId, override) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const overrides = await readJson(paths.accountOverrides, {});
  const cleaned = sanitizeOverrideInput(override || {});
  const next = { ...overrides, [safeAccountId]: cleaned };
  await writeJson(paths.accountOverrides, next);
  return next;
});

secureHandle("overrides:clear", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const overrides = await readJson(paths.accountOverrides, {});
  delete overrides[safeAccountId];
  await writeJson(paths.accountOverrides, overrides);
  return overrides;
});

secureHandle("auth:startMicrosoft", async () => {
  const settings = await readSettings();
  return startMicrosoftLogin(settings);
});

secureHandle("auth:completeMicrosoft", async (_event, flowId) => completeMicrosoftLogin(requireSafeId(flowId, "login flow id")));

secureHandle("auth:logout", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const accounts = await readJson(paths.accounts, []);
  const next = accounts.filter((account) => account.id !== safeAccountId);
  await writeJson(paths.accounts, next);
  const settings = await readSettings();
  if (settings.taggedAccountId === safeAccountId) {
    await writeJson(paths.settings, { ...settings, taggedAccountId: "" });
  }
  return next.map(publicAccount);
});

secureHandle("accounts:save", async (_event, input) => {
  const accounts = await readJson(paths.accounts, []);
  const safeInputId = input?.id ? requireSafeId(input.id, "account id") : "";
  const existing = safeInputId
    ? accounts.find((account) => account.id === safeInputId)
    : accounts.find((account) => account.name.toLowerCase() === String(input?.name || "").trim().toLowerCase());
  const account = sanitizeAccountInput({ ...input, id: existing?.id || safeInputId || "" }, existing || {});
  const next = existing
    ? accounts.map((item) => (item.id === existing.id ? account : item))
    : [...accounts, account];
  await writeJson(paths.accounts, next);
  return next.map(publicAccount);
});

secureHandle("accounts:delete", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  if (runningProcesses.has(safeAccountId)) throw new Error("Stop the running process before deleting this account.");
  const accounts = await readJson(paths.accounts, []);
  const next = accounts.filter((account) => account.id !== safeAccountId);
  await writeJson(paths.accounts, next);
  const settings = await readSettings();
  if (settings.taggedAccountId === safeAccountId) {
    await writeJson(paths.settings, { ...settings, taggedAccountId: "" });
  }
  return next.map(publicAccount);
});

secureHandle("profiles:save", async (_event, input) => {
  const profiles = await readJson(paths.profiles, defaultProfiles);
  const profile = {
    ...getSharedLaunchProfile(sanitizeSettings(input || {})),
    id: input?.id ? requireSafeId(input.id, "profile id") : `profile-${Date.now()}`,
    name: cleanString(input?.name || "Launch profile", 80),
    gameDirName: requireSafePathSegment(input?.gameDirName || input?.id || "profile", "profile")
  };
  await createProfileFolders(profile);
  const exists = profiles.some((item) => item.id === profile.id);
  const next = exists ? profiles.map((item) => (item.id === profile.id ? profile : item)) : [...profiles, profile];
  await writeJson(paths.profiles, next);
  return next;
});

secureHandle("content:list", async (_event, profileId) => listProfileContent(requireSafeId(profileId || sharedProfileId, "profile id")));

secureHandle("content:addMods", async (_event, profileId) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const result = await dialog.showOpenDialog({
    title: "Add Minecraft mods",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Minecraft mod jars", extensions: ["jar"] }]
  });
  if (result.canceled) return listProfileContent(safeProfileId);
  await copyContentFiles(safeProfileId, "mods", result.filePaths);
  return listProfileContent(safeProfileId);
});

secureHandle("content:addResourcePacks", async (_event, profileId) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const result = await dialog.showOpenDialog({
    title: "Add resource packs",
    properties: ["openFile", "openDirectory", "multiSelections"],
    filters: [{ name: "Resource packs", extensions: ["zip"] }]
  });
  if (result.canceled) return listProfileContent(safeProfileId);
  await copyContentFiles(safeProfileId, "resourcepacks", result.filePaths);
  return listProfileContent(safeProfileId);
});

secureHandle("content:openFolder", async (_event, profileId, folderName) => {
  const folder = await getProfileContentFolder(requireSafeId(profileId || sharedProfileId, "profile id"), folderName);
  await shell.openPath(folder);
  return folder;
});

secureHandle("versions:list", async () => getAvailableVersions());

secureHandle("versions:install", async (event, versionId) => {
  const progress = createProgressEmitter(event.sender);
  return installVersion(requireSafeId(versionId, "version id"), progress);
});

secureHandle("server:ping", async (_event, serverAddress) => pingServer(sanitizeServerAddress(serverAddress)));

secureHandle("server:health", async (_event, serverAddress) => getServerHealth(sanitizeServerAddress(serverAddress)));

secureHandle("servers:list", async () => readJson(paths.savedServers, []));

secureHandle("servers:save", async (_event, input) => {
  const servers = await readJson(paths.savedServers, []);
  const id = input?.id ? requireSafeId(input.id, "server id") : `server-${Date.now()}`;
  const server = {
    id,
    name: cleanString(input?.name || "", 80),
    address: sanitizeServerAddress(input?.address || ""),
    version: cleanString(input?.version || "", 80),
    preferredAccountId: input?.preferredAccountId ? requireSafeId(input.preferredAccountId, "preferred account id") : "",
    notes: cleanString(input?.notes || "", 240),
    updatedAt: new Date().toISOString()
  };
  const next = servers.some((item) => item.id === id) ? servers.map((item) => (item.id === id ? server : item)) : [...servers, server];
  await writeJson(paths.savedServers, next);
  return next;
});

secureHandle("servers:delete", async (_event, serverId) => {
  const safeServerId = requireSafeId(serverId, "server id");
  const servers = await readJson(paths.savedServers, []);
  const next = servers.filter((server) => server.id !== safeServerId);
  await writeJson(paths.savedServers, next);
  return next;
});

secureHandle("java:health", async (_event, versionId) => checkJavaHealth(cleanString(versionId || "", 96)));

secureHandle("repair:run", async () => runRepairCheck());

secureHandle("mods:analyze", async (_event, profileId) => analyzeMods(requireSafeId(profileId || sharedProfileId, "profile id")));

secureHandle("fpsOptimizer:scan", async (_event, presetId = "") => buildFpsOptimizerReport(presetId ? requireSafeId(presetId, "optimizer preset id") : ""));

secureHandle("fpsOptimizer:apply", async (_event, input = {}) => {
  const presetId = input?.presetId ? requireSafeId(input.presetId, "optimizer preset id") : "";
  const settings = await readSettings();
  const accountOverrides = await readJson(paths.accountOverrides, {});
  const accounts = (await readJson(paths.accounts, [])).map(publicAccount);
  const report = await buildFpsOptimizerReport(presetId);
  await saveOptimizerBaseline(settings, accountOverrides);
  const applied = applyRecommendedSettings({
    currentSettings: settings,
    currentOverrides: accountOverrides,
    recommendation: report.recommendation,
    accounts,
    applyPerAccount: input.applyPerAccount !== false
  });
  await writeJson(paths.settings, { ...defaultSettings, ...applied.settings });
  await writeJson(paths.accountOverrides, applied.accountOverrides);
  return {
    applied,
    report: await buildFpsOptimizerReport(presetId)
  };
});

secureHandle("fpsOptimizer:reset", async () => {
  const settings = await readSettings();
  const baseline = await readJson(paths.optimizerBaseline, null);
  const reset = resetOptimizerSettings({
    currentSettings: settings,
    defaultSettings,
    baselineSettings: baseline?.settings || null
  });
  await writeJson(paths.settings, { ...defaultSettings, ...reset.settings });
  if (baseline?.accountOverrides) {
    await writeJson(paths.accountOverrides, baseline.accountOverrides);
  }
  return {
    reset,
    report: await buildFpsOptimizerReport("")
  };
});

secureHandle("backups:create", async (_event, input) => createBackup({
  accountId: input?.accountId ? requireSafeId(input.accountId, "account id") : "",
  label: cleanString(input?.label || "", 80)
}));

secureHandle("backups:list", async () => listBackups());

secureHandle("backups:openFolder", async () => {
  const backupDir = path.join(paths.launcherData, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  await shell.openPath(backupDir);
  return backupDir;
});

secureHandle("crash:analyze", async (_event, accountId) => analyzeCrash(requireSafeId(accountId, "account id")));

secureHandle("serverLogins:list", async () => (await readJson(paths.serverLogins, [])).map(publicServerLogin));

secureHandle("serverLogins:save", async (_event, input) => {
  const logins = await readJson(paths.serverLogins, []);
  const safeInputId = input?.id ? requireSafeId(input.id, "server login id") : "";
  const existing = safeInputId ? logins.find((login) => login.id === safeInputId) : null;
  const login = sanitizeServerLoginInput({ ...input, id: safeInputId || "" }, existing);
  const id = login.id;
  const next = existing ? logins.map((item) => (item.id === id ? login : item)) : [...logins, login];
  await writeJson(paths.serverLogins, next);
  return next.map(publicServerLogin);
});

secureHandle("serverLogins:delete", async (_event, loginId) => {
  const safeLoginId = requireSafeId(loginId, "server login id");
  const logins = await readJson(paths.serverLogins, []);
  const next = logins.filter((login) => login.id !== safeLoginId);
  await writeJson(paths.serverLogins, next);
  return next.map(publicServerLogin);
});

secureHandle("serverLogins:clear", async () => {
  await writeJson(paths.serverLogins, []);
  return [];
});

secureHandle("serverLogins:copyCommand", async (_event, loginId) => {
  const safeLoginId = requireSafeId(loginId, "server login id");
  const logins = await readJson(paths.serverLogins, []);
  const login = logins.find((item) => item.id === safeLoginId);
  if (!login) throw new Error("Saved server login not found.");
  const password = decryptToken(login.password);
  if (!password) throw new Error("No password saved for this server login.");
  const command = `${login.commandPrefix || "/login"} ${password}`;
  clipboard.writeText(command);
  return { copied: true, label: login.label, serverAddress: login.serverAddress };
});

secureHandle("launch:start", async (event, selections) => {
  const settings = await readSettings();
  if (!Array.isArray(selections)) throw new Error("Launch selection must be a list.");
  const limited = selections
    .slice(0, Number(settings.maxParallelLaunches || 5))
    .map((selection) => ({ accountId: requireSafeId(selection?.accountId, "account id") }));
  const launched = [];

  for (const selection of limited) {
    const progress = (payload) => {
      const next = { ...payload, accountId: selection.accountId, at: new Date().toISOString() };
      downloadEvents.unshift(next);
      downloadEvents.splice(80);
      event.sender.send("versions:progress", next);
    };
    launched.push(await launchAccount(selection, progress));
    await new Promise((resolve) => setTimeout(resolve, Number(settings.staggerLaunchMs || 0)));
  }

  return launched;
});

secureHandle("launch:stop", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const entry = runningProcesses.get(safeAccountId);
  if (!entry) return false;
  entry.child.kill();
  runningProcesses.delete(safeAccountId);
  await appendLog(safeAccountId, "Manual stop requested.");
  return true;
});

secureHandle("launch:restart", async (event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const entry = runningProcesses.get(safeAccountId);
  if (entry) {
    entry.child.kill();
    runningProcesses.delete(safeAccountId);
    await appendLog(safeAccountId, "Restart requested.");
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  const progress = (payload) => {
    const next = { ...payload, accountId: safeAccountId, at: new Date().toISOString() };
    downloadEvents.unshift(next);
    downloadEvents.splice(80);
    event.sender.send("versions:progress", next);
  };
  return launchAccount({ accountId: safeAccountId }, progress);
});

secureHandle("launch:windowAction", async (_event, accountId, action) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const safeAction = cleanString(action, 20);
  const entry = runningProcesses.get(safeAccountId);
  if (!entry) return { ok: false, message: "Instance is not running." };
  if (safeAction === "focus" || safeAction === "minimize") {
    const ok = runWindowPowerShell(entry.child.pid, safeAction);
    return { ok, message: ok ? `${safeAction} requested.` : "Window action is only supported on Windows." };
  }
  return { ok: false, message: "Unknown window action." };
});

secureHandle("launch:openFolder", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const entry = runningProcesses.get(safeAccountId);
  const accounts = await readJson(paths.accounts, []);
  const settings = await readSettings();
  const account = accounts.find((item) => item.id === safeAccountId);
  const folder = entry?.gameDir || (account ? path.join(paths.instances, getInstanceDirName(account, getSharedLaunchProfile(settings))) : paths.instances);
  assertInsideDirectory(paths.instances, folder);
  await shell.openPath(folder);
  return folder;
});

secureHandle("logs:read", async (_event, accountId) => {
  const safeAccountId = requireSafeId(accountId, "account id");
  const logPath = assertInsideDirectory(paths.logs, path.join(paths.logs, `${safeAccountId}.log`));
  if (!fss.existsSync(logPath)) return "";
  return fs.readFile(logPath, "utf8");
});

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}


// ================= NEW EXTENDED FEATURES =================
secureHandle("java:detect", async () => {
  const settings = await readSettings();
  const runtimeDir = path.join(paths.launcherData, "runtime");
  return javaManager.detectJavaInstallations({
    forceRefresh: true,
    customPaths: settings.javaPath ? [settings.javaPath] : [],
    runtimeDir
  });
});

secureHandle("java:downloadRuntime", async (event, requestedMajor) => {
  const major = parseInt(requestedMajor, 10) || 21;
  const runtimeDir = path.join(paths.launcherData, "runtime");
  const progressEmitter = createProgressEmitter(event.sender);
  const installed = await javaManager.downloadMojangRuntime(major, runtimeDir, (p) => {
    progressEmitter({
      versionId: `Java-${major}`,
      percent: p.percent,
      message: p.message
    });
  });

  const settings = await readSettings();
  await writeJson(paths.settings, { ...settings, javaPath: installed.path });
  return installed;
});

secureHandle("content:importDropped", async (_event, profileId, type, filePaths, allowOverwrite) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const folderName = type === "resourcepacks" ? "resourcepacks" : "mods";
  const targetDir = await getProfileContentFolder(safeProfileId, folderName);
  return dragDropHandler.importFiles(targetDir, filePaths, folderName, Boolean(allowOverwrite));
});

secureHandle("modrinth:search", async (_event, query, mcVersion, category) => {
  const cleanQuery = cleanString(query || "", 64);
  const cleanVer = cleanString(mcVersion || "", 32);
  const cleanCat = cleanString(category || "", 32);
  return modrinthService.searchMods(cleanQuery, cleanVer, cleanCat);
});

secureHandle("modrinth:curated", async (_event, mcVersion, profileId) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const modsDir = await getProfileContentFolder(safeProfileId, "mods");
  const cleanVer = cleanString(mcVersion || "1.21.1", 32);
  return modrinthService.getCuratedFeaturedMods(cleanVer, modsDir);
});

secureHandle("modrinth:install", async (event, projectId, mcVersion, profileId) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const modsDir = await getProfileContentFolder(safeProfileId, "mods");
  const progressEmitter = createProgressEmitter(event.sender);
  const cleanProjectId = cleanString(projectId || "", 64);
  const cleanVer = cleanString(mcVersion || "1.21.1", 32);

  return modrinthService.installMod(cleanProjectId, cleanVer, modsDir, (p) => {
    progressEmitter({
      versionId: cleanProjectId,
      percent: p.percent,
      message: p.message
    });
  });
});

secureHandle("modrinth:uninstall", async (_event, profileId, filename) => {
  const safeProfileId = requireSafeId(profileId || sharedProfileId, "profile id");
  const modsDir = await getProfileContentFolder(safeProfileId, "mods");
  return modrinthService.uninstallMod(filename, modsDir);
});

secureHandle("network:status", async () => {
  const isOnline = await offlineCache.checkOnline();
  return { online: isOnline, mode: isOnline ? "online" : "offline" };
});

secureHandle("window:minimize", (event) => {
  windowFromEvent(event)?.minimize();
});

secureHandle("window:toggleMaximize", (event) => {
  const win = windowFromEvent(event);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

secureHandle("window:close", (event) => {
  windowFromEvent(event)?.close();
});

function getJavaInstallations() {
  return javaCandidates
    .filter((candidate) => fss.existsSync(candidate.path))
    .map((candidate) => ({ ...candidate, recommendedFor: javaRecommendation(candidate.major) }));
}

function createProgressEmitter(sender) {
  return (payload) => {
    const event = { ...payload, at: new Date().toISOString() };
    downloadEvents.unshift(event);
    downloadEvents.splice(80);
    sender.send("versions:progress", event);
  };
}

function javaRecommendation(major) {
  if (major >= 21) return "Minecraft 1.20.5+ and 1.21+";
  if (major >= 17) return "Minecraft 1.18 through 1.20.4";
  if (major >= 8) return "Minecraft 1.16.5 and older";
  return "Legacy";
}

function pingServer(serverAddress) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const { host, port } = parseServerAddress(serverAddress);
    const socket = net.createConnection({ host, port, timeout: 5000 });
    socket.on("connect", () => {
      const latencyMs = Date.now() - startedAt;
      socket.destroy();
      resolve({ ok: true, host, port, latencyMs, message: `TCP connection opened in ${latencyMs}ms.` });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, host, port, latencyMs: null, message: "Server timed out. Check address, internet, or server status." });
    });
    socket.on("error", (error) => {
      resolve({ ok: false, host, port, latencyMs: null, message: error.message });
    });
  });
}

async function getServerHealth(serverAddress) {
  const startedAt = Date.now();
  const fallback = await pingServer(serverAddress);
  if (!fallback.ok) {
    return { ...fallback, online: false, checkedAt: new Date().toISOString() };
  }
  try {
    const status = await minecraftStatusPing(serverAddress);
    return {
      ...fallback,
      ...status,
      online: true,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ...fallback,
      online: true,
      statusWarning: `Server answered TCP but not Minecraft status: ${error.message}`,
      checkedAt: new Date().toISOString()
    };
  }
}

function minecraftStatusPing(serverAddress) {
  return new Promise((resolve, reject) => {
    const { host, port } = parseServerAddress(serverAddress);
    const socket = net.createConnection({ host, port, timeout: 5000 });
    const chunks = [];
    socket.on("connect", () => {
      const hostBytes = Buffer.from(host, "utf8");
      const handshake = Buffer.concat([
        writeVarInt(0),
        writeVarInt(763),
        writeVarInt(hostBytes.length),
        hostBytes,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        writeVarInt(1)
      ]);
      socket.write(Buffer.concat([writeVarInt(handshake.length), handshake]));
      const request = Buffer.from([0]);
      socket.write(Buffer.concat([writeVarInt(request.length), request]));
    });
    socket.on("data", (data) => {
      chunks.push(data);
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Status request timed out"));
    });
    socket.on("error", reject);
    socket.on("close", () => {
      try {
        const buffer = Buffer.concat(chunks);
        let offset = 0;
        const packetLength = readVarInt(buffer, offset);
        offset = packetLength.offset;
        const packetId = readVarInt(buffer, offset);
        offset = packetId.offset;
        const stringLength = readVarInt(buffer, offset);
        offset = stringLength.offset;
        const payload = buffer.slice(offset, offset + stringLength.value).toString("utf8");
        const json = JSON.parse(payload);
        resolve({
          versionName: json.version?.name || "",
          protocol: json.version?.protocol || null,
          playersOnline: json.players?.online ?? null,
          playersMax: json.players?.max ?? null,
          motd: flattenMotd(json.description),
          rawStatusBytes: packetLength.value,
          packetId: packetId.value
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeVarInt(value) {
  const bytes = [];
  let current = Number(value) >>> 0;
  do {
    let temp = current & 0x7f;
    current >>>= 7;
    if (current !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (current !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let value = 0;
  let position = 0;
  let currentByte;
  do {
    currentByte = buffer[offset++];
    value |= (currentByte & 0x7f) << (position * 7);
    position += 1;
    if (position > 5) throw new Error("VarInt too big");
  } while ((currentByte & 0x80) === 0x80);
  return { value, offset };
}

function flattenMotd(description) {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (description.text) return description.text;
  if (Array.isArray(description.extra)) return description.extra.map(flattenMotd).join("");
  return "";
}

function parseServerAddress(serverAddress) {
  const clean = sanitizeServerAddress(serverAddress || "localhost");
  const [host, portText] = clean.split(":");
  return {
    host: host || "localhost",
    port: Number(portText || 25565)
  };
}

async function checkJavaHealth(versionId = "") {
  const settings = await readSettings();
  const selectedVersionId = versionId || settings.minecraftVersionId || "1.21.1";
  const requiredMajor = javaManager.getRequiredJavaMajor(selectedVersionId);
  const runtimeDir = path.join(paths.launcherData, "runtime");
  const installations = javaManager.detectJavaInstallations({
    customPaths: settings.javaPath ? [settings.javaPath] : [],
    runtimeDir
  });

  const selectedJava = javaManager.selectBestJava(requiredMajor, settings.javaPath, installations);
  const isCompatible = Boolean(selectedJava && selectedJava.major >= requiredMajor);

  return {
    requiredMajor,
    selected: selectedJava || { path: settings.javaPath || "java", name: "No compatible Java detected", major: 0 },
    installations,
    ok: isCompatible,
    recommendations: [
      "Minecraft 1.20.5+ / 1.21+ requires Java 21 or newer",
      "Minecraft 1.18 through 1.20.4 requires Java 17",
      "Minecraft 1.16.5 and older requires Java 8",
      "You can download official portable Java runtimes directly in Settings"
    ]
  };
}

async function runRepairCheck() {
  const settings = await readSettings();
  const profile = getSharedLaunchProfile(settings);
  const report = [];
  const add = (name, ok, message) => report.push({ name, ok, message });
  add("Shared folders", fss.existsSync(path.join(paths.instances, sharedProfileDefaults.gameDirName)), "Shared mods/resourcepack folders exist.");
  add("Java", (await checkJavaHealth(profile.minecraftVersionId)).ok, "Java path exists and is compatible with selected version when detectable.");
  const installedVersions = await getInstalledVersions();
  add("Version files", installedVersions.length > 0, installedVersions.length ? `${installedVersions.length} installed version(s) found.` : "No installed versions found yet.");
  add("Libraries", fss.existsSync(path.join(paths.sharedMinecraft, "libraries")), "Libraries folder is present.");
  add("Assets", fss.existsSync(path.join(paths.sharedMinecraft, "assets")), "Assets folder is present.");
  const modAnalysis = await analyzeMods(sharedProfileId);
  add("Mod compatibility", modAnalysis.warnings.length === 0, modAnalysis.warnings.length ? `${modAnalysis.warnings.length} warning(s) found.` : "No obvious mod warnings found.");
  add("Fabric Loader", profile.modloader !== "fabric" || installedVersions.some((version) => /fabric/i.test(version)), profile.modloader === "fabric" ? "Fabric profile should install automatically on launch if missing." : "Vanilla setup selected.");
  return { checkedAt: new Date().toISOString(), report };
}

async function analyzeMods(profileId = sharedProfileId) {
  const settings = await readSettings();
  const profile = getSharedLaunchProfile(settings);
  const folder = await getProfileContentFolder(profileId, "mods");
  const files = await listContentFolder(folder);
  const jars = files.filter((file) => file.name.toLowerCase().endsWith(".jar"));
  const warnings = [];
  const seen = new Map();
  for (const file of jars) {
    const lower = file.name.toLowerCase();
    const normalized = lower.replace(/[-_ ]?(fabric|forge|quilt|neoforge|mc)?[-_ ]?1\.\d+(?:\.\d+)?/g, "").replace(/[-_ ]?\d+(?:\.\d+){1,3}.*/, "");
    if (seen.has(normalized)) warnings.push({ file: file.name, level: "warning", message: `Possible duplicate with ${seen.get(normalized)}.` });
    seen.set(normalized, file.name);
    if (profile.modloader === "fabric" && /(forge|neoforge)/i.test(lower)) warnings.push({ file: file.name, level: "error", message: "Looks like a Forge/NeoForge mod in a Fabric setup." });
    if (profile.modloader === "vanilla") warnings.push({ file: file.name, level: "warning", message: "Mods are present but shared setup is Vanilla." });
    const versionMatch = lower.match(/1\.(\d+)(?:\.(\d+))?/);
    const selected = String(profile.minecraftVersionId || settings.minecraftVersionId || "");
    if (versionMatch && /^\d+\.\d+/.test(selected) && !selected.startsWith(`1.${versionMatch[1]}`)) {
      warnings.push({ file: file.name, level: "warning", message: `May target Minecraft 1.${versionMatch[1]}, while selected version is ${selected}.` });
    }
  }
  if (profile.modloader === "fabric" && jars.length && !jars.some((file) => /fabric-api/i.test(file.name))) {
    warnings.push({ file: "Fabric API", level: "warning", message: "Fabric API is not detected. Many Fabric mods require it." });
  }
  return { profileId, folder, files: jars, warnings, suggestions: performancePackMods };
}

async function createBackup(input = {}) {
  const accounts = await readJson(paths.accounts, []);
  const settings = await readSettings();
  const profile = getSharedLaunchProfile(settings);
  const safeAccountId = input.accountId ? requireSafeId(input.accountId, "account id") : "";
  const account = accounts.find((item) => item.id === safeAccountId);
  const sourceDir = account
    ? path.join(paths.instances, getInstanceDirName(account, profile))
    : path.join(paths.instances, sharedProfileDefaults.gameDirName);
  assertInsideDirectory(paths.instances, sourceDir);
  const backupDir = path.join(paths.launcherData, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = sanitizePathSegment(input.label || account?.name || "shared");
  const backupPath = path.join(backupDir, `${label}-${stamp}.zip`);
  assertInsideDirectory(backupDir, backupPath);
  const zip = new AdmZip();
  if (fss.existsSync(sourceDir)) {
    for (const name of ["saves", "mods", "resourcepacks", "shaderpacks", "config"]) {
      const folder = path.join(sourceDir, name);
      if (fss.existsSync(folder)) zip.addLocalFolder(folder, name);
    }
    for (const name of ["options.txt", "servers.dat"]) {
      const file = path.join(sourceDir, name);
      if (fss.existsSync(file)) zip.addLocalFile(file);
    }
  }
  zip.addFile("backup-info.json", Buffer.from(JSON.stringify({ sourceDir, createdAt: new Date().toISOString(), accountId: safeAccountId }, null, 2)));
  zip.writeZip(backupPath);
  return { backupPath, sourceDir };
}

async function listBackups() {
  const backupDir = path.join(paths.launcherData, "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const entries = await fs.readdir(backupDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
      const stats = fss.statSync(fullPath);
      return { name: entry.name, path: fullPath, size: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function createProfileFolders(profile) {
  const folderName = profile.gameDirName || profile.id || "profile";
  const base = path.join(rootDir, "profiles", folderName);
  await Promise.all(["mods", "resourcepacks", "shaderpacks", "screenshots", "saves", "logs"].map((folder) =>
    fs.mkdir(path.join(base, folder), { recursive: true })
  ));
}

async function getProfileById(profileId) {
  return getSharedLaunchProfile(await readSettings());
}

async function getProfileContentFolder(profileId, folderName) {
  requireSafeId(profileId || sharedProfileId, "profile id");
  if (!["mods", "resourcepacks", "shaderpacks"].includes(folderName)) {
    throw new Error("Unsupported content folder.");
  }
  const profile = await getProfileById(profileId);
  const folder = path.join(paths.instances, profile.gameDirName || profile.id, folderName);
  assertInsideDirectory(paths.instances, folder);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

async function listProfileContent(profileId) {
  return {
    mods: await listContentFolder(await getProfileContentFolder(profileId, "mods")),
    resourcepacks: await listContentFolder(await getProfileContentFolder(profileId, "resourcepacks")),
    shaderpacks: await listContentFolder(await getProfileContentFolder(profileId, "shaderpacks"))
  };
}

async function listContentFolder(folder) {
  if (!fss.existsSync(folder)) return [];
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(folder, entry.name);
      const stats = fss.statSync(fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "folder" : path.extname(entry.name).replace(".", "") || "file",
        size: entry.isDirectory() ? null : stats.size,
        updatedAt: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function copyContentFiles(profileId, folderName, filePaths) {
  const targetFolder = await getProfileContentFolder(profileId, folderName);
  for (const source of filePaths) {
    const stats = fss.statSync(source);
    const sourceExt = path.extname(source).toLowerCase();
    if (folderName === "mods" && (!stats.isFile() || sourceExt !== ".jar")) {
      throw new Error("Only .jar files can be added to the mods folder.");
    }
    if (folderName === "resourcepacks" && stats.isFile() && sourceExt !== ".zip") {
      throw new Error("Only .zip files or folders can be added as resource packs.");
    }
    if (folderName === "shaderpacks" && stats.isFile() && sourceExt !== ".zip") {
      throw new Error("Only .zip files or folders can be added as shader packs.");
    }

    const name = requireSafePathSegment(path.basename(source), "content");
    const destination = path.join(targetFolder, name);
    assertInsideDirectory(targetFolder, destination);
    if (path.resolve(source) === path.resolve(destination)) continue;
    if (stats.isDirectory()) {
      await fs.cp(source, destination, { recursive: true, force: true });
    } else {
      await fs.copyFile(source, destination);
    }
  }
}
