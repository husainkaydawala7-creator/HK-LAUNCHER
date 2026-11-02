const state = {
  accounts: [],
  profiles: [],
  versions: { latest: {}, versions: [] },
  settings: {},
  running: [],
  paths: {},
  javaInstallations: [],
  modSuggestions: [],
  serverLogins: [],
  profileContent: { mods: [], resourcepacks: [] },
  accountOverrides: {},
  savedServers: [],
  runningInstances: [],
  setupPresets: [],
  performanceModes: [],
  optimizerPresets: [],
  advancedModes: [],
  fpsOptimizer: null,
  performancePackMods: [],
  downloadEvents: [],
  backups: []
};

let microsoftFlowId = "";
const $ = (selector) => document.querySelector(selector);

function bindWindowControls() {
  $("#windowMinimize")?.addEventListener("click", () => window.launcher.minimizeWindow());
  $("#windowMaximize")?.addEventListener("click", async () => {
    const maximized = await window.launcher.toggleMaximizeWindow();
    $("#windowMaximize")?.classList.toggle("is-maximized", Boolean(maximized));
  });
  $("#windowClose")?.addEventListener("click", () => window.launcher.closeWindow());
}

window.launcher.onVersionProgress((payload) => {
  state.downloadEvents = [payload, ...state.downloadEvents].slice(0, 80);
  const percent = Number(payload.percent || 0);
  const message = `${payload.versionId || "Version"}: ${payload.message || "Working"} (${percent}%)`;
  $("#versionStatus").textContent = message;
  $("#launchStatus").textContent = message;
  setProgress("#versionProgressBar", percent);
  setProgress("#launchProgressBar", percent);
  renderDownloadEvents();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    $(`#${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "logs") refreshLog();
    if (tab.dataset.tab === "versions" && !state.versions.versions.length) loadVersions();
    if (tab.dataset.tab === "fpsOptimizer" && !state.fpsOptimizer) refreshFpsOptimizer();
  });
});

document.querySelectorAll("[data-home-tab]").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelector(`.tab[data-tab="${item.dataset.homeTab}"]`)?.click();
  });
});

async function loadState() {
  Object.assign(state, await window.launcher.load());
  state.serverLogins = await window.launcher.listServerLogins();
  state.savedServers = await window.launcher.listServers();
  state.backups = await window.launcher.listBackups();
  renderAll();
  await refreshProfileContent();
}

function renderAll() {
  renderHome();
  renderLaunchList();
  renderInstances();
  renderAccounts();
  renderVersions();
  renderMods();
  renderPacks();
  renderServers();
  renderPerformance();
  renderFpsOptimizer();
  renderJavaManager();
  renderBackups();
  renderSettings();
  renderLogsSelector();
  renderPresetSelectors();
  renderDownloadEvents();
}

function renderHome() {
  const profile = getSharedProfile();
  const select = $("#homeTaggedAccount");
  const taggedId = state.settings.taggedAccountId || state.accounts[0]?.id || "";
  const account = state.accounts.find((item) => item.id === taggedId) || state.accounts[0];
  select.innerHTML = state.accounts.length
    ? state.accounts.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} (${escapeHtml(item.authMode)})</option>`).join("")
    : `<option value="">No accounts</option>`;
  select.value = account?.id || "";
  $("#homeProfile").textContent = profile?.name || "Automatic Performance Setup";
  $("#homeVersion").textContent = `${profile?.minecraftVersionId || state.settings.minecraftVersionId || "latest-compatible"} / ${profile?.modloader || "vanilla"}`;
  $("#homeAccount").textContent = account ? account.name : "No account selected";

  const avatarBadge = $("#homeAvatarBadge");
  if (avatarBadge) {
    if (account?.skinUrl) {
      avatarBadge.innerHTML = `<img src="${escapeHtml(account.skinUrl)}" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" alt="" />`;
    } else {
      avatarBadge.innerHTML = `<span>${escapeHtml((account?.name || "U")[0].toUpperCase())}</span>`;
    }
  }
}

function getSharedProfile() {
  return state.profiles[0] || {
    id: "shared-launch",
    name: "Automatic Performance Setup",
    minecraftVersionId: state.settings.minecraftVersionId || "latest-compatible",
    modloader: state.settings.modloader || "fabric",
    ramMb: state.settings.ramMb || 4096,
    fpsCap: state.settings.fpsCap || 0,
    width: state.settings.windowWidth || 1280,
    height: state.settings.windowHeight || 720,
    renderDistance: state.settings.renderDistance || 6,
    gameDirName: "shared-launch"
  };
}

function renderPresetSelectors() {
  // The launcher uses one shared setup, so no visible preset selectors are needed here.
}

function renderDownloadEvents() {
  const container = $("#downloadEvents");
  if (!container) return;
  const events = state.downloadEvents || [];
  if (!events.length) {
    container.innerHTML = `<div class="empty-file">No download activity yet.</div>`;
    return;
  }
  container.innerHTML = events.slice(0, 8).map((event) => `
    <div class="feed-row">
      <strong>${escapeHtml(event.versionId || "Download")} ${Number(event.percent || 0)}%</strong>
      <span class="muted">${escapeHtml(event.message || "Working")}</span>
    </div>
  `).join("");
}

function renderLaunchList() {
  const list = $("#accountLaunchList");
  list.innerHTML = "";

  if (!state.accounts.length) {
    list.innerHTML = `<div class="card empty-card">Login with Microsoft or add a local account before launching.</div>`;
    return;
  }

  state.accounts.forEach((account) => {
    const isRunning = state.running.includes(account.id);
    const disabled = isRunning || (account.authMode === "microsoft" && !account.hasToken);
    const accountType = account.authMode === "local" ? "Local offline profile" : "Microsoft account";
    const readiness = isRunning ? "Running" : disabled ? "Needs login" : "Ready";
    const readinessClass = isRunning ? "running" : disabled ? "locked" : "ready";
    const row = document.createElement("div");
    row.className = `launch-row simple-launch-row ${disabled ? "is-disabled" : ""} ${isRunning ? "is-running" : ""}`;
    row.innerHTML = `
      <label class="launch-select-cell" title="Select account">
        <input type="checkbox" class="launch-check" data-account-id="${account.id}" ${disabled ? "disabled" : ""} />
        <span aria-hidden="true"></span>
      </label>
      <img class="avatar" src="${account.skinUrl || ""}" alt="" />
      <div class="row-main">
        <h3>${escapeHtml(account.name)}</h3>
        <p class="muted">${escapeHtml(accountType)}</p>
      </div>
      <div class="row-end">
        <span class="status-pill ${readinessClass}">${escapeHtml(readiness)}</span>
        ${isRunning ? `<button class="stop small-action" data-account-id="${account.id}">Stop</button>` : ""}
      </div>
    `;
    list.appendChild(row);
  });

  document.querySelectorAll(".stop").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.launcher.stop(button.dataset.accountId);
      await loadState();
    });
  });
}

function renderInstances() {
  renderRunningInstances();
  const container = $("#instanceRows");
  const labels = ["Main", "Account 2", "Account 3", "Account 4", "Account 5"];
  const profile = getSharedProfile();
  const ramLabel = `${Math.round((profile?.ramMb || 0) / 102.4) / 10} GB`;
  const fpsLabel = profile?.fpsCap ? `${profile.fpsCap} FPS` : "Smart FPS";
  container.innerHTML = labels.map((label, index) => {
    const account = state.accounts[index];
    const folder = account?.instanceId || account?.id || "account folder";
    return `
      <article class="instance-row planned-row">
        <div class="row-main">
          <h3>${label}</h3>
          <p class="muted">${escapeHtml(account?.name || "No account assigned")} / ${escapeHtml(profile?.name || "Shared setup")}</p>
        </div>
        <div class="row-metrics">
          <span class="metric-pill">${escapeHtml(ramLabel)}</span>
          <span class="metric-pill">${escapeHtml(fpsLabel)}</span>
          <span class="metric-pill">${escapeHtml(folder)}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderRunningInstances() {
  const container = $("#runningInstances");
  if (!container) return;
  const running = state.runningInstances || [];
  if (!running.length) {
    container.innerHTML = `<article class="card empty-card">No running Minecraft instances yet.</article>`;
    return;
  }
  container.innerHTML = running.map((instance) => {
    const fpsLabel = instance.fpsCap ? `${instance.fpsCap} FPS` : "Smart FPS";
    const resolution = `${instance.width || 0}x${instance.height || 0}`;
    return `
    <article class="instance-row running-row">
      <div class="row-main">
        <h3>${escapeHtml(instance.accountName)}</h3>
        <p class="muted">${escapeHtml(instance.version)} ${escapeHtml(instance.loader)} | ${escapeHtml(resolution)} | ${escapeHtml(instance.renderDistance)} render</p>
      </div>
      <div class="row-metrics">
        <span class="status-pill running">Running</span>
        <span class="metric-pill">${escapeHtml(fpsLabel)}</span>
        <span class="metric-pill">${formatBytes(instance.ramMb * 1024 * 1024)}</span>
      </div>
      <div class="card-actions row-actions">
        <button data-instance-action="focus" data-account-id="${instance.accountId}">Focus</button>
        <button data-instance-action="minimize" data-account-id="${instance.accountId}">Minimize</button>
        <button data-open-instance="${instance.accountId}">Folder</button>
        <button data-restart-instance="${instance.accountId}">Restart</button>
        <button class="danger" data-stop-instance="${instance.accountId}">Close</button>
      </div>
    </article>
  `;
  }).join("");

  document.querySelectorAll("[data-instance-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.launcher.windowAction(button.dataset.accountId, button.dataset.instanceAction);
    });
  });
  document.querySelectorAll("[data-open-instance]").forEach((button) => {
    button.addEventListener("click", async () => window.launcher.openInstanceFolder(button.dataset.openInstance));
  });
  document.querySelectorAll("[data-restart-instance]").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.launcher.restart(button.dataset.restartInstance);
      await loadState();
    });
  });
  document.querySelectorAll("[data-stop-instance]").forEach((button) => {
    button.addEventListener("click", async () => {
      await window.launcher.stop(button.dataset.stopInstance);
      await loadState();
    });
  });
}

function renderAccounts() {
  const container = $("#accountCards");
  container.innerHTML = "";
  if (!state.accounts.length) {
    container.innerHTML = `<div class="card empty-card">No accounts registered yet. Add a local account above or login with Microsoft.</div>`;
    return;
  }
  state.accounts.forEach((account) => {
    const override = state.accountOverrides?.[account.id] || {};
    const card = document.createElement("article");
    card.className = "card";
    const isLocal = account.authMode === "local";
    card.innerHTML = `
      <h3>${escapeHtml(account.name)}</h3>
      <p class="muted">${escapeHtml(isLocal ? "Offline account - singleplayer/private offline-mode only" : "Microsoft account")}<br />${escapeHtml(account.uuid || "Offline UUID generated at launch")}</p>
      <div class="override-grid">
        <label>RAM MB<input data-override-field="ramMb" data-account-id="${account.id}" value="${escapeHtml(override.ramMb || "")}" placeholder="Shared" /></label>
        <label>FPS<input data-override-field="fpsCap" data-account-id="${account.id}" value="${escapeHtml(override.fpsCap || "")}" placeholder="Shared" /></label>
        <label>Width<input data-override-field="width" data-account-id="${account.id}" value="${escapeHtml(override.width || "")}" placeholder="Shared" /></label>
        <label>Height<input data-override-field="height" data-account-id="${account.id}" value="${escapeHtml(override.height || "")}" placeholder="Shared" /></label>
        <label>Render<input data-override-field="renderDistance" data-account-id="${account.id}" value="${escapeHtml(override.renderDistance || "")}" placeholder="Shared" /></label>
        <label>Java path<input data-override-field="javaPath" data-account-id="${account.id}" value="${escapeHtml(override.javaPath || "")}" placeholder="Shared" /></label>
      </div>
      <div class="card-actions">
        <button data-save-override="${account.id}">Save override</button>
        <button data-clear-override="${account.id}">Clear override</button>
        <button class="danger" data-logout-account="${account.id}">${isLocal ? "Remove account" : "Logout"}</button>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll("[data-logout-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      const removedId = button.dataset.logoutAccount;
      state.accounts = await window.launcher.logoutAccount(removedId);
      if (state.settings.taggedAccountId === removedId) {
        state.settings = await window.launcher.saveSettings({
          ...state.settings,
          taggedAccountId: state.accounts[0]?.id || ""
        });
      }
      renderAll();
    });
  });

  document.querySelectorAll("[data-save-override]").forEach((button) => {
    button.addEventListener("click", async () => {
      const accountId = button.dataset.saveOverride;
      const fields = [...document.querySelectorAll(`[data-account-id="${accountId}"][data-override-field]`)];
      const override = Object.fromEntries(fields.map((field) => [field.dataset.overrideField, field.value.trim()]));
      state.accountOverrides = await window.launcher.saveOverride(accountId, override);
      renderAccounts();
    });
  });

  document.querySelectorAll("[data-clear-override]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.accountOverrides = await window.launcher.clearOverride(button.dataset.clearOverride);
      renderAccounts();
    });
  });
}

async function loadVersions() {
  $("#versionList").innerHTML = `<div class="card empty-card">Loading versions...</div>`;
  try {
    state.versions = await window.launcher.getVersions();
    renderVersions();
    renderSettings();
  } catch (error) {
    $("#versionList").innerHTML = `<div class="card empty-card">${escapeHtml(error.message)}</div>`;
  }
}

function renderVersions() {
  const list = $("#versionList");
  if (!state.versions.versions.length) {
    list.innerHTML = `<div class="card empty-card">Refresh to load Mojang versions.</div>`;
    return;
  }

  const versions = filteredVersions();
  list.innerHTML = versions.map((version) => `
    <article class="version-row">
      <div>
        <h3>${escapeHtml(version.id)}</h3>
        <p class="muted">${escapeHtml(version.type)} ${version.installed ? "Installed" : "Not installed"}</p>
      </div>
      <button data-select-version="${version.id}" ${version.installed ? "" : "disabled"}>Use</button>
      <button class="primary" data-install-version="${version.id}" ${version.installed ? "disabled" : ""}>${version.installed ? "Installed" : "Install"}</button>
    </article>
  `).join("");

  document.querySelectorAll("[data-select-version]").forEach((button) => {
    button.addEventListener("click", async () => saveSelectedVersion(button.dataset.selectVersion));
  });

  document.querySelectorAll("[data-install-version]").forEach((button) => {
    button.addEventListener("click", async () => {
      const versionId = button.dataset.installVersion;
      button.textContent = "Installing...";
      button.disabled = true;
      $("#versionStatus").textContent = `Installing ${versionId}`;
      setProgress("#versionProgressBar", 1);
      try {
        await window.launcher.installVersion(versionId);
        state.versions = await window.launcher.getVersions();
        await saveSelectedVersion(versionId);
        $("#versionStatus").textContent = `${versionId} installed`;
        setProgress("#versionProgressBar", 100);
      } catch (error) {
        $("#versionStatus").textContent = error.message;
        button.textContent = "Failed";
        button.disabled = false;
      }
      renderVersions();
      renderSettings();
    });
  });
}

function filteredVersions() {
  const filter = $("#versionFilter")?.value || "release";
  const search = ($("#versionSearch")?.value || "").toLowerCase();
  return state.versions.versions.filter((version) => {
    const typeMatch = filter === "all" || version.type === filter;
    const searchMatch = !search || version.id.toLowerCase().includes(search);
    return typeMatch && searchMatch;
  });
}

async function renderMods() {
  const select = $("#modsProfileSelect");
  if (select) {
    const previous = select.value;
    select.innerHTML = profileOptionsHtml();
    select.value = state.profiles.some((profile) => profile.id === previous) ? previous : state.profiles[0]?.id || "";
  }
  renderContentLists();
  await loadCuratedModrinthMods();
}

async function loadCuratedModrinthMods() {
  const container = $("#modCards");
  if (!container) return;
  const statusEl = $("#modrinthStatus");
  const profileId = getSelectedContentProfileId();
  const mcVersion = state.settings?.minecraftVersionId && state.settings.minecraftVersionId !== "latest-compatible" 
    ? state.settings.minecraftVersionId 
    : "1.21.1";

  container.innerHTML = '<div class="feed-row">Loading curated Modrinth performance mods...</div>';
  try {
    const mods = await window.launcher.getCuratedMods(mcVersion, profileId);
    renderModCardsList(mods, container);
  } catch (err) {
    container.innerHTML = `<div class="empty-file">Could not load Modrinth catalog: ${escapeHtml(err.message)}</div>`;
  }
}

function renderModCardsList(mods, container) {
  if (!mods || !mods.length) {
    container.innerHTML = '<div class="empty-file">No matching mods found for this game version.</div>';
    return;
  }

  container.innerHTML = mods.map(mod => `
    <article class="mod-card-item">
      <div class="mod-card-icon-col">
        ${mod.iconUrl 
          ? `<img src="${escapeHtml(mod.iconUrl)}" class="mod-icon-img" alt="${escapeHtml(mod.title)}" />`
          : `<div class="mod-icon-fallback">🧩</div>`
        }
      </div>
      <div class="mod-card-info-col">
        <div class="mod-card-title-row">
          <strong>${escapeHtml(mod.title)}</strong>
          <span class="mod-author-tag">by ${escapeHtml(mod.author || "Community")}</span>
          ${mod.downloads ? `<span class="mod-downloads-tag">${Number(mod.downloads).toLocaleString()} dl</span>` : ""}
        </div>
        <p class="mod-card-desc">${escapeHtml(mod.description || "")}</p>
        <div class="mod-card-actions">
          ${mod.isInstalled 
            ? `<span class="badge-pill badge-installed">✓ Installed</span>
               <button type="button" class="btn-uninstall-mod danger" data-mod-slug="${escapeHtml(mod.slug || mod.id)}">Uninstall</button>`
            : `<button type="button" class="btn-mc-green btn-install-mod" data-mod-id="${escapeHtml(mod.id || mod.slug)}" data-mod-title="${escapeHtml(mod.title)}">Install</button>`
          }
        </div>
      </div>
    </article>
  `).join("");

  // Attach install listeners
  container.querySelectorAll(".btn-install-mod").forEach(btn => {
    btn.addEventListener("click", async () => {
      const modId = btn.dataset.modId;
      const modTitle = btn.dataset.modTitle;
      const profileId = getSelectedContentProfileId();
      const mcVersion = state.settings?.minecraftVersionId && state.settings.minecraftVersionId !== "latest-compatible" 
        ? state.settings.minecraftVersionId 
        : "1.21.1";

      btn.disabled = true;
      btn.textContent = "Installing...";
      const statusEl = $("#modrinthStatus");
      if (statusEl) {
        statusEl.textContent = `Installing ${modTitle} and dependencies from Modrinth...`;
        statusEl.style.color = "#15803d";
      }

      try {
        const res = await window.launcher.installModrinthMod(modId, mcVersion, profileId);
        if (statusEl) {
          statusEl.textContent = `✓ Installed ${modTitle}! (${res.installedFiles.join(", ")})`;
          statusEl.style.color = "#15803d";
        }
        await refreshProfileContent();
        await loadCuratedModrinthMods();
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = `❌ Installation failed: ${err.message}`;
          statusEl.style.color = "#ef4444";
        }
        btn.disabled = false;
        btn.textContent = "Install";
      }
    });
  });

  // Attach uninstall listeners
  container.querySelectorAll(".btn-uninstall-mod").forEach(btn => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.modSlug;
      const profileId = getSelectedContentProfileId();
      btn.disabled = true;
      try {
        // Find matching jar file in installed mods
        const installed = state.profileContent?.mods || [];
        const match = installed.find(m => m.name.toLowerCase().includes(slug.replace("-", "").toLowerCase()));
        if (match) {
          await window.launcher.uninstallMod(profileId, match.name);
        }
        await refreshProfileContent();
        await loadCuratedModrinthMods();
      } catch (err) {
        alert("Failed to uninstall: " + err.message);
      }
    });
  });
}

function renderPacks() {
  const select = $("#packsProfileSelect");
  const previous = select.value || $("#modsProfileSelect").value;
  select.innerHTML = profileOptionsHtml();
  select.value = state.profiles.some((profile) => profile.id === previous) ? previous : state.profiles[0]?.id || "";
  const sections = ["16x FPS packs", "Clean GUI packs", "Low-fire packs", "Shaders", "Screenshots", "World backups"];
  $("#packCards").innerHTML = sections.map((section) => `
    <article class="mini-card">
      <h3>${section}</h3>
      <p class="muted">Shared content is copied into each launched account folder.</p>
    </article>
  `).join("");
  renderContentLists();
}

function profileOptionsHtml() {
  const profile = getSharedProfile();
  return `<option value="${profile.id}">All accounts (${escapeHtml(profile.gameDirName || "shared-launch")})</option>`;
}

async function refreshProfileContent() {
  const profileId = getSelectedContentProfileId();
  if (!profileId) return;
  state.profileContent = await window.launcher.listProfileContent(profileId);
  renderContentLists();
}

function getSelectedContentProfileId() {
  return $("#modsProfileSelect")?.value || $("#packsProfileSelect")?.value || state.profiles[0]?.id || "";
}

function syncContentProfileSelectors(sourceId) {
  const value = $(sourceId).value;
  if ($("#modsProfileSelect")) $("#modsProfileSelect").value = value;
  if ($("#packsProfileSelect")) $("#packsProfileSelect").value = value;
}

function renderContentLists() {
  if ($("#installedModsList")) {
    const mods = state.profileContent?.mods || [];
    $("#installedModsList").innerHTML = renderFileList(mods, "No mods added yet.", "mods");
    const countEl = $("#installedModsCount");
    if (countEl) countEl.textContent = `${mods.length} Installed`;

    // Attach row delete buttons
    $("#installedModsList").querySelectorAll(".btn-delete-file-row").forEach(btn => {
      btn.addEventListener("click", async () => {
        const filename = btn.dataset.fileName;
        const profileId = getSelectedContentProfileId();
        if (confirm(`Remove ${filename}?`)) {
          await window.launcher.uninstallMod(profileId, filename);
          await refreshProfileContent();
          await loadCuratedModrinthMods();
        }
      });
    });
  }
  if ($("#installedResourcePacksList")) {
    $("#installedResourcePacksList").innerHTML = renderFileList(state.profileContent?.resourcepacks, "No resource packs added yet.", "packs");
  }
}

async function runModAnalysis() {
  const profileId = getSelectedContentProfileId();
  const output = $("#modAnalysis");
  output.textContent = "Checking mods...";
  const result = await window.launcher.analyzeMods(profileId);
  if (!result.warnings.length) {
    output.innerHTML = `<strong>No obvious compatibility warnings.</strong><p class="muted">${result.files.length} mod jar(s) checked.</p>`;
    return;
  }
  output.innerHTML = result.warnings.map((warning) => `
    <div class="report-row warn">
      <strong>${escapeHtml(warning.file)}</strong>
      <span class="muted">${escapeHtml(warning.message)}</span>
    </div>
  `).join("");
}

function renderFileList(files, emptyText) {
  if (!files?.length) return `<div class="empty-file">${emptyText}</div>`;
  return files.map((file) => `
    <div class="file-row">
      <span>${escapeHtml(file.name)}</span>
      <span>${file.type === "folder" ? "folder" : formatBytes(file.size)}</span>
    </div>
  `).join("");
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderServers() {
  if (!$("#serverAddress").value) $("#serverAddress").value = state.settings.serverIp || "";
  $("#savedServerAccount").innerHTML = `<option value="">Any account</option>${state.accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}`;
  renderServerLogins();
  renderSavedServers();
}

function renderSavedServers() {
  const container = $("#savedServerCards");
  if (!container) return;
  if (!state.savedServers.length) {
    container.innerHTML = `<article class="card empty-card">No saved servers yet.</article>`;
    return;
  }
  container.innerHTML = state.savedServers.map((server) => `
    <article class="card">
      <h3>${escapeHtml(server.name || server.address)}</h3>
      <p class="muted">${escapeHtml(server.address)}<br />${escapeHtml(server.version || "Any version")}</p>
      <div class="card-actions">
        <button data-health-server="${server.address}">Health</button>
        <button data-edit-saved-server="${server.id}">Edit</button>
        <button class="danger" data-delete-saved-server="${server.id}">Delete</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-health-server]").forEach((button) => {
    button.addEventListener("click", async () => runServerHealth(button.dataset.healthServer));
  });
  document.querySelectorAll("[data-edit-saved-server]").forEach((button) => {
    button.addEventListener("click", () => {
      const server = state.savedServers.find((item) => item.id === button.dataset.editSavedServer);
      if (!server) return;
      $("#savedServerId").value = server.id;
      $("#savedServerName").value = server.name || "";
      $("#savedServerAddress").value = server.address || "";
      $("#savedServerVersion").value = server.version || "";
      $("#savedServerAccount").value = server.preferredAccountId || "";
      $("#savedServerNotes").value = server.notes || "";
    });
  });
  document.querySelectorAll("[data-delete-saved-server]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.savedServers = await window.launcher.deleteServer(button.dataset.deleteSavedServer);
      renderSavedServers();
    });
  });
}

async function runServerHealth(address) {
  $("#serverPingOutput").textContent = "Checking server health...";
  const result = await window.launcher.serverHealth(address);
  $("#serverPingOutput").textContent = result.online
    ? `${result.host}:${result.port} online | ${result.latencyMs}ms | ${result.versionName || "version unknown"} | ${result.playersOnline ?? "?"}/${result.playersMax ?? "?"} players${result.motd ? ` | ${result.motd}` : ""}`
    : result.message;
}

function renderServerLogins() {
  const container = $("#serverLoginCards");
  if (!container) return;
  if (!state.serverLogins.length) {
    container.innerHTML = `<article class="card empty-card">No saved server login yet.</article>`;
    return;
  }
  container.innerHTML = state.serverLogins.map((login) => `
    <article class="card">
      <h3>${escapeHtml(login.label)}</h3>
      <p class="muted">${escapeHtml(login.serverAddress || "No server set")}<br />${escapeHtml(login.commandPrefix || "/login")} ${login.hasPassword ? "password saved" : "no password"}</p>
      <div class="card-actions">
        <button class="primary" data-copy-server-login="${login.id}">Copy auto-fill command</button>
        <button data-edit-server-login="${login.id}">Edit</button>
        <button class="danger" data-delete-server-login="${login.id}">Delete</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-copy-server-login]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await window.launcher.copyServerLoginCommand(button.dataset.copyServerLogin);
        $("#serverLoginStatus").textContent = `Copied login command for ${result.label || result.serverAddress}. Paste it in Minecraft chat.`;
      } catch (error) {
        $("#serverLoginStatus").textContent = error.message;
      }
    });
  });

  document.querySelectorAll("[data-edit-server-login]").forEach((button) => {
    button.addEventListener("click", () => {
      const login = state.serverLogins.find((item) => item.id === button.dataset.editServerLogin);
      if (!login) return;
      $("#serverLoginId").value = login.id;
      $("#serverLoginLabel").value = login.label || "";
      $("#serverLoginAddress").value = login.serverAddress || "";
      $("#serverLoginUsername").value = login.username || "";
      $("#serverLoginCommand").value = login.commandPrefix || "/login";
      $("#serverLoginPassword").value = "";
    });
  });

  document.querySelectorAll("[data-delete-server-login]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.serverLogins = await window.launcher.deleteServerLogin(button.dataset.deleteServerLogin);
      renderServerLogins();
    });
  });
}

function renderPerformance() {
  $("#setupPresetCards").innerHTML = (state.setupPresets || []).map((preset) => `
    <article class="card">
      <h3>${escapeHtml(preset.name)}</h3>
      <p class="muted">${escapeHtml(preset.description)}</p>
      <div class="card-actions"><button data-apply-preset="${preset.id}">Apply</button></div>
    </article>
  `).join("");

  $("#javaCards").innerHTML = state.javaInstallations.length
    ? state.javaInstallations.map((java) => `
      <article class="card">
        <h3>${escapeHtml(java.name)}</h3>
        <p class="muted">Java ${java.major}<br />${escapeHtml(java.recommendedFor)}</p>
      </article>
    `).join("")
    : `<article class="card"><h3>No Java found</h3><p class="muted">Install Java 8, 17, or 21.</p></article>`;

  $("#performanceCards").innerHTML = (state.performanceModes || []).map((mode) => `
    <article class="card">
      <h3>${escapeHtml(mode.name)}</h3>
      <p class="muted">${escapeHtml(mode.use)}</p>
      <div class="metric-grid">
        <span>${mode.settings.fpsCap || "Auto"} FPS</span>
        <span>${mode.settings.renderDistance || "Auto"} render</span>
      </div>
      <div class="card-actions"><button data-apply-preset="${mode.id}">Apply mode</button></div>
    </article>
  `).join("");

  document.querySelectorAll("[data-apply-preset]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.settings = await window.launcher.applyPreset(button.dataset.applyPreset);
      await loadState();
    });
  });
}

function renderFpsOptimizer() {
  if (!$("#fpsOptimizerScore")) return;
  const view = state.fpsOptimizer;
  if (!view) {
    $("#fpsOptimizerScore").innerHTML = `
      <article class="optimizer-score needs">
        <span>FPS Optimizer</span>
        <strong>Not scanned yet</strong>
        <p>Run a scan to analyze hardware, Java, Minecraft settings, mods, packs, shaders, and FPS pressure.</p>
      </article>
    `;
    $("#fpsOptimizerHardware").innerHTML = "";
    $("#fpsOptimizerCurrent").innerHTML = "";
    $("#fpsOptimizerPresets").innerHTML = "";
    $("#fpsOptimizerAdvancedModes").innerHTML = "";
    $("#fpsOptimizerSuggestions").innerHTML = "";
    $("#fpsOptimizerBeforeAfter").innerHTML = "";
    $("#fpsOptimizerMods").innerHTML = "";
    $("#fpsOptimizerMultiAccount").innerHTML = "";
    $("#fpsOptimizerWarnings").innerHTML = "";
    $("#fpsOptimizerStatus").textContent = "Ready to scan.";
    return;
  }

  const recommendation = view.recommendation;
  const current = view.analysis.current;
  $("#fpsOptimizerScore").innerHTML = `
    <article class="optimizer-score ${escapeHtml(view.statusClass)}">
      <span>Optimization Status</span>
      <strong>${escapeHtml(recommendation.status)}</strong>
      <p>${recommendation.score}/100 score. ${escapeHtml(recommendation.systemTier.name)} detected. Recommended FPS: ${escapeHtml(recommendation.fpsPlan.label)}.</p>
      <p class="muted">${escapeHtml(recommendation.fpsPlan.strategy)}</p>
    </article>
  `;

  $("#fpsOptimizerHardware").innerHTML = (view.hardwareCards || []).map((card) => `
    <article class="mini-card optimizer-hardware-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <p class="muted">${escapeHtml(card.detail)}</p>
    </article>
  `).join("");

  $("#fpsOptimizerCurrent").innerHTML = `
    ${optimizerMetric("Version", current.minecraftVersionId)}
    ${optimizerMetric("Loader", current.modloader)}
    ${optimizerMetric("RAM", `${Math.round(current.ramMb / 1024 * 10) / 10}GB`)}
    ${optimizerMetric("Current FPS", current.fpsCap ? current.fpsCap : "Automatic")}
    ${optimizerMetric("Recommended FPS", recommendation.fpsPlan.label)}
    ${optimizerMetric("System Tier", recommendation.systemTier.name)}
    ${optimizerMetric("Resolution", current.resolution.label)}
    ${optimizerMetric("Render", current.renderDistance)}
    ${optimizerMetric("Simulation", current.simulationDistance)}
    ${optimizerMetric("Mods", view.analysis.contentCounts.mods)}
    ${optimizerMetric("Resource Packs", view.analysis.contentCounts.resourcepacks)}
    ${optimizerMetric("Shaders", view.analysis.contentCounts.shaderpacks)}
  `;

  $("#fpsOptimizerPresets").innerHTML = (recommendation.presets || []).map((preset) => `
    <article class="card optimizer-preset ${preset.id === recommendation.selectedPresetId ? "active" : ""}">
      <h3>${escapeHtml(preset.name)}</h3>
      <p class="muted">${escapeHtml(preset.description)}</p>
      <div class="metric-grid">
        <span>${escapeHtml(preset.fpsDescription || `${preset.settings.fpsCap} FPS`)}</span>
        <span>${preset.settings.renderDistance} render</span>
        <span>${Math.round(preset.settings.ramMb / 1024 * 10) / 10}GB RAM</span>
      </div>
      <div class="card-actions"><button type="button" data-fps-preset="${preset.id}">Preview</button></div>
    </article>
  `).join("");
  document.querySelectorAll("[data-fps-preset]").forEach((button) => {
    button.addEventListener("click", () => refreshFpsOptimizer(button.dataset.fpsPreset));
  });

  $("#fpsOptimizerAdvancedModes").innerHTML = (recommendation.advancedModes || []).map((mode) => `
    <article class="mini-card">
      <h3>${escapeHtml(mode.name)}</h3>
      <p class="muted">${escapeHtml(mode.description)}</p>
    </article>
  `).join("");

  $("#fpsOptimizerSuggestions").innerHTML = (recommendation.suggestions || []).map((item) => `
    <article class="optimizer-advice ${escapeHtml(item.severity || "low")}">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p class="muted">Current: ${escapeHtml(item.current)} | Recommended: ${escapeHtml(item.recommended)}</p>
      </div>
      <p>${escapeHtml(item.why)}</p>
    </article>
  `).join("");

  $("#fpsOptimizerBeforeAfter").innerHTML = `
    ${renderBeforeAfterColumn("Current", recommendation.beforeAfter.current)}
    ${renderBeforeAfterColumn("Recommended", recommendation.beforeAfter.recommended)}
  `;

  $("#fpsOptimizerMods").innerHTML = recommendation.recommendedMods.length
    ? recommendation.recommendedMods.map((mod) => `
      <article class="mini-card">
        <h3>${escapeHtml(mod.name)}</h3>
        <p class="muted">${escapeHtml(mod.use)}</p>
        <p>${escapeHtml(mod.why)}</p>
      </article>
    `).join("")
    : `<article class="mini-card"><h3>Fabric mods unavailable</h3><p class="muted">Switch the shared setup to Fabric to use Sodium/Lithium-style performance packs.</p></article>`;

  $("#fpsOptimizerMultiAccount").innerHTML = `
    <article class="status-card">
      <strong>Recommended max accounts: ${recommendation.multiAccount.maxRecommendedAccounts}</strong>
      <p class="muted">${escapeHtml(recommendation.multiAccount.reason)}</p>
    </article>
    ${(recommendation.multiAccount.accounts || []).map((account) => `
      <article class="instance-row optimizer-account-row">
        <div>
          <h3>${escapeHtml(account.role)} - ${escapeHtml(account.name)}</h3>
          <p class="muted">${escapeHtml(account.why)}</p>
        </div>
        <span>${Math.round(account.ramMb / 1024 * 10) / 10}GB</span>
        <span>${account.fpsCap} FPS</span>
        <span>${account.width}x${account.height} | ${account.renderDistance} render</span>
      </article>
    `).join("")}
  `;

  $("#fpsOptimizerWarnings").innerHTML = (recommendation.safeWarnings || []).map((warning) => `
    <div class="feed-row">${escapeHtml(warning)}</div>
  `).join("");
  $("#fpsOptimizerStatus").textContent = `Last scan: ${new Date(view.generatedAt).toLocaleTimeString()}`;
}

function optimizerMetric(label, value) {
  return `
    <article class="mini-card optimizer-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderBeforeAfterColumn(title, rows = []) {
  return `
    <article class="optimizer-compare-column">
      <h3>${escapeHtml(title)}</h3>
      ${rows.map(([label, value]) => `
        <div class="compare-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join("")}
    </article>
  `;
}

async function refreshFpsOptimizer(presetId = "") {
  $("#fpsOptimizerStatus").textContent = "Scanning hardware and launcher setup...";
  try {
    state.fpsOptimizer = await window.launcher.scanFpsOptimizer(presetId);
    renderFpsOptimizer();
  } catch (error) {
    $("#fpsOptimizerStatus").textContent = error.message;
  }
}

function openFpsConfirmModal() {
  const recommendation = state.fpsOptimizer?.recommendation;
  if (!recommendation) return;
  const changes = recommendation.changes || [];
  const accountChanges = state.accounts.length > 1 ? recommendation.multiAccount?.accounts || [] : [];
  $("#fpsConfirmList").innerHTML = `
    ${changes.length ? changes.map((change) => `
      <div class="compare-row">
        <span>${escapeHtml(change.label)}</span>
        <strong>${escapeHtml(change.current)} -> ${escapeHtml(change.recommended)}</strong>
        <p class="muted">${escapeHtml(change.why)}</p>
      </div>
    `).join("") : `<div class="feed-row">Shared settings already match the recommendation.</div>`}
    ${accountChanges.length ? `<div class="section-break"></div>${accountChanges.map((account) => `
      <div class="compare-row">
        <span>${escapeHtml(account.role)} - ${escapeHtml(account.name)}</span>
        <strong>${Math.round(account.ramMb / 1024 * 10) / 10}GB, ${account.fpsCap} FPS, ${account.width}x${account.height}</strong>
        <p class="muted">${escapeHtml(account.why)}</p>
      </div>
    `).join("")}` : ""}
  `;
  const modal = $("#fpsConfirmModal"); if (modal) { modal.hidden = false; modal.style.display = "flex"; }
}

function closeFpsConfirmModal() {
  const modal = $("#fpsConfirmModal");
  if (modal) {
    modal.hidden = true;
    modal.style.display = "none";
  }
}

async function confirmFpsApply() {
  const presetId = state.fpsOptimizer?.recommendation?.selectedPresetId || "";
  $("#confirmFpsApply").disabled = true;
  $("#fpsOptimizerStatus").textContent = "Applying optimizer settings...";
  try {
    const result = await window.launcher.applyFpsOptimizer({ presetId, applyPerAccount: true });
    state.fpsOptimizer = result.report;
    closeFpsConfirmModal();
    await loadState();
    $("#fpsOptimizerStatus").textContent = `Applied ${result.applied.changes.length} shared change(s) and ${result.applied.accountOverrideCount} account override(s).`;
  } catch (error) {
    $("#fpsOptimizerStatus").textContent = error.message;
  } finally {
    $("#confirmFpsApply").disabled = false;
  }
}

async function resetFpsOptimization() {
  if (!window.confirm("Reset FPS optimizer settings back to the saved baseline or launcher defaults?")) return;
  $("#fpsOptimizerStatus").textContent = "Resetting optimizer settings...";
  try {
    const result = await window.launcher.resetFpsOptimizer();
    state.fpsOptimizer = result.report;
    await loadState();
    $("#fpsOptimizerStatus").textContent = `Reset complete. ${result.reset.changes.length} setting(s) changed.`;
  } catch (error) {
    $("#fpsOptimizerStatus").textContent = error.message;
  }
}

function renderSettings() {
  if ($("#javaPath")) $("#javaPath").value = state.settings.javaPath || "java";
  if ($("#microsoftClientId")) $("#microsoftClientId").value = state.settings.microsoftClientId || "";
  if ($("#fabricVersionId")) $("#fabricVersionId").value = state.settings.fabricVersionId || "";
  if ($("#sharedModloader")) $("#sharedModloader").value = state.settings.modloader || getSharedProfile().modloader || "fabric";
  if ($("#sharedRamMb")) $("#sharedRamMb").value = state.settings.ramMb ?? getSharedProfile().ramMb ?? 4096;
  if ($("#sharedFpsCap")) $("#sharedFpsCap").value = state.settings.fpsCap ?? getSharedProfile().fpsCap ?? 0;
  if ($("#sharedWindowWidth")) $("#sharedWindowWidth").value = state.settings.windowWidth ?? getSharedProfile().width ?? 1280;
  if ($("#sharedWindowHeight")) $("#sharedWindowHeight").value = state.settings.windowHeight ?? getSharedProfile().height ?? 720;
  if ($("#sharedRenderDistance")) $("#sharedRenderDistance").value = state.settings.renderDistance ?? getSharedProfile().renderDistance ?? 6;
  if ($("#serverIp")) $("#serverIp").value = state.settings.serverIp || "";
  if ($("#maxParallelLaunches")) $("#maxParallelLaunches").value = state.settings.maxParallelLaunches || 5;
  if ($("#staggerLaunchMs")) $("#staggerLaunchMs").value = state.settings.staggerLaunchMs || 2500;
  if ($("#closeLauncherAfterLaunch")) $("#closeLauncherAfterLaunch").checked = Boolean(state.settings.closeLauncherAfterLaunch);
  if ($("#lowPriorityAfk")) $("#lowPriorityAfk").checked = state.settings.lowPriorityAfk !== false;
  if ($("#updateChannel")) $("#updateChannel").value = state.settings.updateChannel || "stable";

  const installed = state.versions.versions.filter((version) => version.installed);
  const selectedVersion = state.settings.minecraftVersionId || "latest-compatible";
  const options = [
    { id: "latest-compatible", label: "Latest compatible with installed Java" },
    { id: "latest-release", label: `Latest release${state.versions.latest?.release ? ` (${state.versions.latest.release})` : ""}` },
    { id: "latest-snapshot", label: `Latest snapshot${state.versions.latest?.snapshot ? ` (${state.versions.latest.snapshot})` : ""}` },
    ...installed.map((version) => ({ id: version.id, label: `${version.id} installed` }))
  ];
  if ($("#minecraftVersionId")) {
    $("#minecraftVersionId").innerHTML = options.map((option) => `<option value="${option.id}">${escapeHtml(option.label)}</option>`).join("");
    $("#minecraftVersionId").value = options.some((option) => option.id === selectedVersion) ? selectedVersion : "latest-compatible";
  }
  if ($("#paths")) {
    $("#paths").innerHTML = Object.entries(state.paths)
      .filter(([key]) => ["sharedMinecraft", "instances", "launcherData", "logs"].includes(key))
      .map(([key, value]) => `<strong>${key}</strong>: ${escapeHtml(value)}`)
      .join("<br />");
  }

  loadDetectedJavas();
}

function renderJavaManager() {
  const output = $("#javaHealthOutput");
  if (!output) return;
  output.innerHTML = `
    <strong>Java Check Ready</strong>
    <p class="muted">Detected ${state.javaInstallations.length} Java installation(s). Run a health check for the selected Minecraft version.</p>
  `;
}

async function runJavaHealth() {
  const output = $("#javaHealthOutput");
  output.textContent = "Checking Java...";
  const result = await window.launcher.javaHealth(state.settings.minecraftVersionId || "latest-compatible");
  output.innerHTML = `
    <div class="report-row ${result.ok ? "ok" : "warn"}">
      <strong>${result.ok ? "Java looks compatible" : "Java needs attention"}</strong>
      <span class="muted">Required Java ${result.requiredMajor}. Selected: ${escapeHtml(result.selected?.name || "Unknown")} (${escapeHtml(result.selected?.path || "")})</span>
    </div>
    ${result.recommendations.map((item) => `<div class="feed-row">${escapeHtml(item)}</div>`).join("")}
  `;
}

function renderBackups() {
  if (!$("#backupAccount")) return;
  $("#backupAccount").innerHTML = `<option value="">Shared setup</option>${state.accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("")}`;
  const list = $("#backupList");
  if (!state.backups.length) {
    list.innerHTML = `<article class="card empty-card">No backups yet.</article>`;
    return;
  }
  list.innerHTML = state.backups.map((backup) => `
    <article class="instance-row">
      <div>
        <h3>${escapeHtml(backup.name)}</h3>
        <p class="muted">${escapeHtml(backup.path)}</p>
      </div>
      <span>${formatBytes(backup.size)}</span>
      <span>${new Date(backup.createdAt).toLocaleDateString()}</span>
      <span>Backup</span>
    </article>
  `).join("");
}

async function runRepair() {
  const output = $("#repairOutput");
  output.innerHTML = `<article class="card empty-card">Running repair check...</article>`;
  const result = await window.launcher.runRepair();
  output.innerHTML = result.report.map((item) => `
    <article class="report-row ${item.ok ? "ok" : "warn"}">
      <strong>${item.ok ? "OK" : "Check"}: ${escapeHtml(item.name)}</strong>
      <span class="muted">${escapeHtml(item.message)}</span>
    </article>
  `).join("");
}

function renderLogsSelector() {
  const select = $("#logAccount");
  select.innerHTML = state.accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join("");
}

async function refreshLog() {
  const accountId = $("#logAccount").value;
  $("#logOutput").textContent = accountId ? await window.launcher.readLog(accountId) : "No account selected.";
}

async function saveSettingsFromForm() {
  await window.launcher.saveSettings({
    ...state.settings,
    javaPath: $("#javaPath")?.value ?? state.settings.javaPath ?? "java",
    microsoftClientId: $("#microsoftClientId")?.value ?? state.settings.microsoftClientId ?? "",
    minecraftVersionId: $("#minecraftVersionId")?.value ?? state.settings.minecraftVersionId ?? "latest-compatible",
    fabricVersionId: $("#fabricVersionId")?.value ?? state.settings.fabricVersionId ?? "",
    taggedAccountId: state.settings.taggedAccountId || "",
    modloader: $("#sharedModloader")?.value ?? state.settings.modloader ?? "fabric",
    ramMb: Number($("#sharedRamMb")?.value ?? state.settings.ramMb ?? 4096),
    fpsCap: Number($("#sharedFpsCap")?.value ?? state.settings.fpsCap ?? 0),
    windowWidth: Number($("#sharedWindowWidth")?.value ?? state.settings.windowWidth ?? 1280),
    windowHeight: Number($("#sharedWindowHeight")?.value ?? state.settings.windowHeight ?? 720),
    renderDistance: Number($("#sharedRenderDistance")?.value ?? state.settings.renderDistance ?? 6),
    serverIp: $("#serverIp")?.value ?? state.settings.serverIp ?? "",
    maxParallelLaunches: Number($("#maxParallelLaunches")?.value ?? state.settings.maxParallelLaunches ?? 5),
    staggerLaunchMs: Number($("#staggerLaunchMs")?.value ?? state.settings.staggerLaunchMs ?? 2500),
    closeLauncherAfterLaunch: Boolean($("#closeLauncherAfterLaunch")?.checked),
    lowPriorityAfk: $("#lowPriorityAfk") ? $("#lowPriorityAfk").checked : (state.settings.lowPriorityAfk !== false),
    updateChannel: $("#updateChannel")?.value ?? state.settings.updateChannel ?? "stable"
  });
  await loadState();
  const statusEl = $("#settingsSaveStatus");
  if (statusEl) {
    statusEl.textContent = "✓ Settings saved successfully!";
    statusEl.style.color = "#15803d";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 3000);
  }
}

async function saveSelectedVersion(versionId) {
  await window.launcher.saveSettings({ ...state.settings, minecraftVersionId: versionId });
  await loadState();
}

function setProgress(selector, percent) {
  const element = $(selector);
  if (element) element.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettingsFromForm();
});

document.querySelectorAll(".btn-preset[data-ram]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ramInput = $("#sharedRamMb");
    if (ramInput) ramInput.value = btn.dataset.ram;
  });
});

$("#localAccountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const statusEl = $("#localAccountStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.style.color = "";
  }

  let rawName = $("#localAccountName").value.trim();
  let name = rawName.replace(/\s+/g, "_");

  if (!name) {
    if (statusEl) {
      statusEl.textContent = "Please enter a valid player name.";
      statusEl.style.color = "#ff7b72";
    }
    return;
  }

  try {
    const instanceVal = $("#localAccountInstance").value.trim();
    const skinVal = $("#localAccountSkin").value.trim();

    const updatedAccounts = await window.launcher.saveAccount({
      authMode: "local",
      name,
      email: "",
      uuid: "",
      instanceId: instanceVal || `local-${name}`,
      skinUrl: skinVal,
      token: ""
    });

    state.accounts = updatedAccounts;

    const savedAccount = updatedAccounts.find((a) => a.name.toLowerCase() === name.toLowerCase()) || updatedAccounts[updatedAccounts.length - 1];

    if (savedAccount && (!state.settings.taggedAccountId || state.accounts.length <= 1)) {
      state.settings = await window.launcher.saveSettings({ ...state.settings, taggedAccountId: savedAccount.id });
    }

    $("#localAccountForm").reset();
    await loadState();

    if (statusEl) {
      statusEl.textContent = `Account "${name}" added successfully! Selected for launch.`;
      statusEl.style.color = "#7ee787";
    }
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = `Failed to add account: ${error.message}`;
      statusEl.style.color = "#ff7b72";
    }
  }
});

$("#startMicrosoftLogin").addEventListener("click", async () => {
  const msgEl = $("#microsoftLoginMessage");
  const codeEl = $("#microsoftCode");
  const completeBtn = $("#completeMicrosoftLogin");

  if (msgEl) {
    msgEl.textContent = "Opening Microsoft sign-in window...";
    msgEl.style.color = "#334155";
  }
  if (codeEl) codeEl.textContent = "";

  try {
    const result = await window.launcher.startMicrosoftLogin();
    if (result?.accounts) {
      state.accounts = result.accounts;
      if (msgEl) {
        msgEl.textContent = `✓ Microsoft account "${result.account.name}" registered and connected!`;
        msgEl.style.color = "#15803d";
      }
      renderAccounts();
      renderHome();
    } else if (result?.flowId) {
      microsoftFlowId = result.flowId;
      if (codeEl) codeEl.textContent = result.userCode;
      if (msgEl) msgEl.textContent = result.message || `Go to ${result.verificationUri}`;
      if (completeBtn) { completeBtn.style.display = ""; completeBtn.disabled = false; }
    }
  } catch (error) {
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.style.color = "#dc2626";
    }
  }
});

$("#completeMicrosoftLogin").addEventListener("click", async () => {
  if (!microsoftFlowId) return;
  $("#microsoftLoginMessage").textContent = "Completing Microsoft login...";
  try {
    state.accounts = await window.launcher.completeMicrosoftLogin(microsoftFlowId);
    microsoftFlowId = "";
    $("#microsoftCode").textContent = "";
    $("#completeMicrosoftLogin").disabled = true;
    $("#microsoftLoginMessage").textContent = "Microsoft account connected.";
    renderAll();
  } catch (error) {
    $("#microsoftLoginMessage").textContent = error.message;
  }
});

$("#launchSelected").addEventListener("click", launchSelectedAccounts);
$("#homeLaunch").addEventListener("click", launchTaggedAccount);
$("#homeTaggedAccount").addEventListener("change", async () => {
  state.settings = await window.launcher.saveSettings({ ...state.settings, taggedAccountId: $("#homeTaggedAccount").value });
  renderHome();
});

async function launchTaggedAccount() {
  const accountId = $("#homeTaggedAccount")?.value || state.settings?.taggedAccountId || state.accounts[0]?.id;
  if (!accountId) {
    const accountsTab = document.querySelector('[data-tab="accounts"]');
    if (accountsTab) accountsTab.click();
    return;
  }
  const statusEl = $("#launchStatus");
  if (statusEl) {
    statusEl.textContent = "Launching Minecraft (downloading missing files if needed)...";
    statusEl.style.color = "#15803d";
  }
  setProgress("#launchProgressBar", 1);
  try {
    await window.launcher.launch([{ accountId }]);
    if (statusEl) {
      statusEl.textContent = "✓ Minecraft process launched!";
      statusEl.style.color = "#15803d";
    }
    setProgress("#launchProgressBar", 100);
    await loadState();
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = "❌ " + (error.message || "Launch failed.");
      statusEl.style.color = "#ef4444";
    }
    setProgress("#launchProgressBar", 0);
  }
}

async function launchSelectedAccounts() {
  const selections = [...document.querySelectorAll(".launch-check:checked")].map((checkbox) => ({
    accountId: checkbox.dataset.accountId
  }));

  if (!selections.length) {
    $("#launchStatus").textContent = "Select at least one account.";
    document.querySelector('[data-tab="launch"]').click();
    return;
  }

  $("#launchStatus").textContent = "Launching. Missing versions install first.";
  setProgress("#launchProgressBar", 1);
  try {
    await window.launcher.launch(selections);
    $("#launchStatus").textContent = "Launch started. HK Launcher is saving output in the background.";
    setProgress("#launchProgressBar", 100);
    await loadState();
  } catch (error) {
    $("#launchStatus").textContent = error.message;
  }
}

$("#serverPingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await runServerHealth($("#serverAddress").value);
});

$("#savedServerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.savedServers = await window.launcher.saveServer({
    id: $("#savedServerId").value,
    name: $("#savedServerName").value,
    address: $("#savedServerAddress").value,
    version: $("#savedServerVersion").value,
    preferredAccountId: $("#savedServerAccount").value,
    notes: $("#savedServerNotes").value
  });
  $("#savedServerForm").reset();
  $("#savedServerId").value = "";
  renderSavedServers();
});

$("#serverLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.serverLogins = await window.launcher.saveServerLogin({
    id: $("#serverLoginId").value,
    label: $("#serverLoginLabel").value,
    serverAddress: $("#serverLoginAddress").value,
    username: $("#serverLoginUsername").value,
    commandPrefix: $("#serverLoginCommand").value,
    password: $("#serverLoginPassword").value
  });
  $("#serverLoginForm").reset();
  $("#serverLoginCommand").value = "/login";
  $("#serverLoginId").value = "";
  $("#serverLoginStatus").textContent = "Saved encrypted server login.";
  renderServerLogins();
});

$("#logAccount").addEventListener("change", refreshLog);
$("#analyzeCrash").addEventListener("click", async () => {
  const accountId = $("#logAccount").value;
  if (!accountId) return;
  $("#crashAnalysis").textContent = "Analyzing crash/log text...";
  const result = await window.launcher.analyzeCrash(accountId);
  $("#crashAnalysis").innerHTML = result.findings.map((finding) => `
    <div class="report-row ${/No common|No crash/.test(finding.problem) ? "ok" : "warn"}">
      <strong>${escapeHtml(finding.problem)}</strong>
      <span class="muted">${escapeHtml(finding.fix)}</span>
    </div>
  `).join("");
});
$("#refreshVersions").addEventListener("click", loadVersions);
$("#versionFilter").addEventListener("change", renderVersions);
$("#versionSearch").addEventListener("input", renderVersions);
$("#modsProfileSelect").addEventListener("change", async () => {
  syncContentProfileSelectors("#modsProfileSelect");
  await refreshProfileContent();
});
$("#packsProfileSelect").addEventListener("change", async () => {
  syncContentProfileSelectors("#packsProfileSelect");
  await refreshProfileContent();
});
$("#addMods").addEventListener("click", async () => {
  const profileId = getSelectedContentProfileId();
  if (!profileId) return;
  state.profileContent = await window.launcher.addMods(profileId);
  renderContentLists();
});
$("#addResourcePacks").addEventListener("click", async () => {
  const profileId = getSelectedContentProfileId();
  if (!profileId) return;
  state.profileContent = await window.launcher.addResourcePacks(profileId);
  renderContentLists();
});
$("#openModsFolder").addEventListener("click", async () => {
  const profileId = getSelectedContentProfileId();
  if (profileId) await window.launcher.openContentFolder(profileId, "mods");
});
$("#openResourcePacksFolder").addEventListener("click", async () => {
  const profileId = getSelectedContentProfileId();
  if (profileId) await window.launcher.openContentFolder(profileId, "resourcepacks");
});
$("#analyzeMods").addEventListener("click", runModAnalysis);
$("#applySetupPreset")?.addEventListener("click", async () => {
  $("#launchStatus").textContent = "Automatic performance tuning is already enabled for every launch.";
});
$("#applyPerformanceMode")?.addEventListener("click", async () => {
  state.settings = await window.launcher.applyPreset("smart-fps");
  $("#launchStatus").textContent = "Smart FPS settings applied.";
  await loadState();
});
$("#scanFpsOptimizer").addEventListener("click", () => refreshFpsOptimizer());
$("#applyFpsOptimization").addEventListener("click", async () => {
  if (!state.fpsOptimizer) await refreshFpsOptimizer();
  openFpsConfirmModal();
});
$("#resetFpsOptimization").addEventListener("click", resetFpsOptimization);
$("#cancelFpsApply").addEventListener("click", closeFpsConfirmModal);
$("#confirmFpsApply").addEventListener("click", confirmFpsApply);
$("#installRecommendedMods").addEventListener("click", async () => {
  $("#fpsOptimizerStatus").textContent = "No auto-install is performed. Opening the Mods page and shared mods folder.";
  document.querySelector('[data-tab="mods"]').click();
  await window.launcher.openContentFolder(getSharedProfile().id, "mods");
});
$("#checkJavaHealth").addEventListener("click", runJavaHealth);
$("#runRepair").addEventListener("click", runRepair);
$("#backupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await window.launcher.createBackup({
    accountId: $("#backupAccount").value,
    label: $("#backupLabel").value
  });
  $("#backupStatus").textContent = `Backup created: ${result.backupPath}`;
  state.backups = await window.launcher.listBackups();
  renderBackups();
});
$("#openBackupsFolder").addEventListener("click", () => window.launcher.openBackupsFolder());
$("#clearServerLogins").addEventListener("click", async () => {
  state.serverLogins = await window.launcher.clearServerLogins();
  $("#securityStatus").textContent = "All saved server login commands were deleted.";
  renderServerLogins();
});

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

bindWindowControls();
loadState();


async function loadDetectedJavas() {
  const select = $("#detectedJavaSelect");
  if (!select) return;
  try {
    const list = await window.launcher.detectJava();
    if (!list || !list.length) {
      select.innerHTML = '<option value="">No standard Java detected on system</option>';
      return;
    }
    const currentPath = ($("#javaPath")?.value || "").toLowerCase();
    select.innerHTML = '<option value="">-- Select a detected Java installation --</option>' +
      list.map(j => {
        const isSelected = currentPath && j.path.toLowerCase() === currentPath;
        return `<option value="${escapeHtml(j.path)}" ${isSelected ? "selected" : ""}>${escapeHtml(j.name)} - ${escapeHtml(j.recommendedFor)} [${j.is64Bit ? "64-bit" : "32-bit"}]</option>`;
      }).join("");
  } catch (err) {
    select.innerHTML = '<option value="">Failed to scan Java installations</option>';
  }
}


// ================= DRAG & DROP SUPPORT =================
function setupDragAndDrop(dropZoneId, panelId, type, statusId) {
  const dropZone = $(dropZoneId);
  const panel = $(panelId);
  if (!panel) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    panel.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropZone) dropZone.classList.add('drag-active');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    panel.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropZone) dropZone.classList.remove('drag-active');
    });
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZone) dropZone.classList.remove('drag-active');

    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;

    const filePaths = Array.from(dt.files).map(f => f.path).filter(Boolean);
    if (!filePaths.length) return;

    const profileId = getSelectedContentProfileId();
    const statusEl = $(statusId);
    if (statusEl) {
      statusEl.textContent = `Importing ${filePaths.length} file(s)...`;
      statusEl.style.color = "#334155";
    }

    try {
      const result = await window.launcher.importDroppedFiles(profileId, type, filePaths, false);
      if (statusEl) {
        const parts = [];
        if (result.imported?.length) parts.push(`✓ Imported ${result.imported.length} ${type === 'mods' ? 'mod(s)' : 'pack(s)'}`);
        if (result.skipped?.length) parts.push(`Skipped ${result.skipped.length} existing duplicate(s)`);
        if (result.errors?.length) parts.push(`Errors: ${result.errors.join('; ')}`);
        statusEl.textContent = parts.join(' | ');
        statusEl.style.color = result.imported?.length ? "#15803d" : "#ef4444";
      }
      await refreshProfileContent();
      if (type === 'mods') await loadCuratedModrinthMods();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = "❌ Failed to import files: " + err.message;
        statusEl.style.color = "#ef4444";
      }
    }
  });
}

// ================= MODRINTH SEARCH & FILTERS =================
function setupModrinthSearch() {
  const searchInput = $("#modrinthSearchInput");
  const categorySelect = $("#modrinthCategorySelect");
  const searchBtn = $("#modrinthSearchBtn");
  const statusEl = $("#modrinthStatus");
  const container = $("#modCards");

  async function executeSearch() {
    const query = searchInput ? searchInput.value.trim() : "";
    const category = categorySelect ? categorySelect.value : "";
    const mcVersion = state.settings?.minecraftVersionId && state.settings.minecraftVersionId !== "latest-compatible" 
      ? state.settings.minecraftVersionId 
      : "1.21.1";

    if (!query && !category) {
      await loadCuratedModrinthMods();
      return;
    }

    if (container) container.innerHTML = '<div class="feed-row">Searching Modrinth API...</div>';
    try {
      const results = await window.launcher.searchModrinth(query, mcVersion, category);
      if (statusEl) statusEl.textContent = `Found ${results.length} result(s) for "${query || category}"`;
      renderModCardsList(results, container);
    } catch (err) {
      if (container) container.innerHTML = `<div class="empty-file">Search failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  if (searchBtn) searchBtn.addEventListener("click", executeSearch);
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") executeSearch();
    });
  }
  if (categorySelect) categorySelect.addEventListener("change", executeSearch);
}

// ================= JAVA RUNTIME AUTO-DOWNLOAD & SELECTION =================
function setupJavaRuntimeControls() {
  const detectedSelect = $("#detectedJavaSelect");
  if (detectedSelect) {
    detectedSelect.addEventListener("change", () => {
      if (detectedSelect.value && $("#javaPath")) {
        $("#javaPath").value = detectedSelect.value;
      }
    });
  }

  const refreshBtn = $("#refreshJavaDetectBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.textContent = "⏳";
      await loadDetectedJavas();
      refreshBtn.textContent = "↻";
    });
  }

  document.querySelectorAll(".btn-download-java").forEach(btn => {
    btn.addEventListener("click", async () => {
      const major = btn.dataset.runtimeMajor;
      const statusEl = $("#javaDownloadStatus");
      btn.disabled = true;
      if (statusEl) {
        statusEl.textContent = `Preparing official Mojang Java ${major} download...`;
        statusEl.style.color = "#334155";
      }

      try {
        const installed = await window.launcher.downloadJavaRuntime(major);
        if (statusEl) {
          statusEl.textContent = `✓ Java ${installed.major} downloaded and configured: ${installed.path}`;
          statusEl.style.color = "#15803d";
        }
        if ($("#javaPath")) $("#javaPath").value = installed.path;
        await loadDetectedJavas();
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = "❌ Download failed: " + err.message;
          statusEl.style.color = "#ef4444";
        }
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// ================= NETWORK ONLINE/OFFLINE STATUS =================
async function updateNetworkStatus() {
  const badge = $("#networkStatusPill");
  if (!badge) return;
  try {
    const status = await window.launcher.getNetworkStatus();
    if (status.online) {
      badge.textContent = "● Online";
      badge.className = "network-badge online";
    } else {
      badge.textContent = "○ Offline Mode";
      badge.className = "network-badge offline";
    }
  } catch (_) {
    badge.textContent = "○ Offline Mode";
    badge.className = "network-badge offline";
  }
}

// Run initial setups
setupDragAndDrop("#modsDropZone", "#mods", "mods", "#modsImportStatus");
setupDragAndDrop("#packsDropZone", "#packs", "resourcepacks", "#packsImportStatus");
setupModrinthSearch();
setupJavaRuntimeControls();
updateNetworkStatus();
setInterval(updateNetworkStatus, 30000);
