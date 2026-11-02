const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcher", {
  load: () => ipcRenderer.invoke("app:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  applyPreset: (presetId) => ipcRenderer.invoke("settings:applyPreset", presetId),
  saveOverride: (accountId, override) => ipcRenderer.invoke("overrides:save", accountId, override),
  clearOverride: (accountId) => ipcRenderer.invoke("overrides:clear", accountId),
  startMicrosoftLogin: () => ipcRenderer.invoke("auth:startMicrosoft"),
  completeMicrosoftLogin: (flowId) => ipcRenderer.invoke("auth:completeMicrosoft", flowId),
  logoutAccount: (accountId) => ipcRenderer.invoke("auth:logout", accountId),
  saveAccount: (account) => ipcRenderer.invoke("accounts:save", account),
  deleteAccount: (accountId) => ipcRenderer.invoke("accounts:delete", accountId),
  saveProfile: (profile) => ipcRenderer.invoke("profiles:save", profile),
  listProfileContent: (profileId) => ipcRenderer.invoke("content:list", profileId),
  addMods: (profileId) => ipcRenderer.invoke("content:addMods", profileId),
  addResourcePacks: (profileId) => ipcRenderer.invoke("content:addResourcePacks", profileId),
  openContentFolder: (profileId, folderName) => ipcRenderer.invoke("content:openFolder", profileId, folderName),
  getVersions: () => ipcRenderer.invoke("versions:list"),
  installVersion: (versionId) => ipcRenderer.invoke("versions:install", versionId),
  onVersionProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("versions:progress", listener);
    return () => ipcRenderer.removeListener("versions:progress", listener);
  },
  pingServer: (serverAddress) => ipcRenderer.invoke("server:ping", serverAddress),
  serverHealth: (serverAddress) => ipcRenderer.invoke("server:health", serverAddress),
  listServers: () => ipcRenderer.invoke("servers:list"),
  saveServer: (server) => ipcRenderer.invoke("servers:save", server),
  deleteServer: (serverId) => ipcRenderer.invoke("servers:delete", serverId),
  javaHealth: (versionId) => ipcRenderer.invoke("java:health", versionId),
  runRepair: () => ipcRenderer.invoke("repair:run"),
  analyzeMods: (profileId) => ipcRenderer.invoke("mods:analyze", profileId),
  scanFpsOptimizer: (presetId) => ipcRenderer.invoke("fpsOptimizer:scan", presetId),
  applyFpsOptimizer: (input) => ipcRenderer.invoke("fpsOptimizer:apply", input),
  resetFpsOptimizer: () => ipcRenderer.invoke("fpsOptimizer:reset"),
  createBackup: (input) => ipcRenderer.invoke("backups:create", input),
  listBackups: () => ipcRenderer.invoke("backups:list"),
  openBackupsFolder: () => ipcRenderer.invoke("backups:openFolder"),
  analyzeCrash: (accountId) => ipcRenderer.invoke("crash:analyze", accountId),
  listServerLogins: () => ipcRenderer.invoke("serverLogins:list"),
  saveServerLogin: (login) => ipcRenderer.invoke("serverLogins:save", login),
  deleteServerLogin: (loginId) => ipcRenderer.invoke("serverLogins:delete", loginId),
  clearServerLogins: () => ipcRenderer.invoke("serverLogins:clear"),
  copyServerLoginCommand: (loginId) => ipcRenderer.invoke("serverLogins:copyCommand", loginId),
  launch: (selections) => ipcRenderer.invoke("launch:start", selections),
  stop: (accountId) => ipcRenderer.invoke("launch:stop", accountId),
  restart: (accountId) => ipcRenderer.invoke("launch:restart", accountId),
  windowAction: (accountId, action) => ipcRenderer.invoke("launch:windowAction", accountId, action),
  openInstanceFolder: (accountId) => ipcRenderer.invoke("launch:openFolder", accountId),
  readLog: (accountId) => ipcRenderer.invoke("logs:read", accountId),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),

  // 1. Dynamic Java Detection & Auto Portable Runtime Downloader
  detectJava: () => ipcRenderer.invoke("java:detect"),
  downloadJavaRuntime: (major) => ipcRenderer.invoke("java:downloadRuntime", major),

  // 2. Drag & Drop Support for Mods & Resource Packs
  importDroppedFiles: (profileId, type, filePaths, allowOverwrite) =>
    ipcRenderer.invoke("content:importDropped", profileId, type, filePaths, allowOverwrite),

  // 3. In-App Mod Downloader using Modrinth API
  searchModrinth: (query, mcVersion, category) =>
    ipcRenderer.invoke("modrinth:search", query, mcVersion, category),
  getCuratedMods: (mcVersion, profileId) =>
    ipcRenderer.invoke("modrinth:curated", mcVersion, profileId),
  installModrinthMod: (projectId, mcVersion, profileId) =>
    ipcRenderer.invoke("modrinth:install", projectId, mcVersion, profileId),
  uninstallMod: (profileId, filename) =>
    ipcRenderer.invoke("modrinth:uninstall", profileId, filename),

  // 4. Offline Mode & Network State
  getNetworkStatus: () => ipcRenderer.invoke("network:status"),
  onNetworkStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("network:statusChange", listener);
    return () => ipcRenderer.removeListener("network:statusChange", listener);
  }
});
