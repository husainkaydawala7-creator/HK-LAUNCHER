const { getPreset, optimizerPresets, advancedModes, performanceMods } = require("./presetManager");
const { classifySystem } = require("./systemClassifier");

function inferJavaMajor(versionId = "") {
  const version = String(versionId || "");
  if (/latest|snapshot/i.test(version)) return 21;
  const match = version.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!match) return 21;
  const minor = Number(match[1]);
  const patch = Number(match[2] || 0);
  if (minor <= 16) return 8;
  if (minor === 17) return 16;
  if (minor >= 20 && patch >= 5) return 21;
  if (minor >= 21) return 21;
  if (minor >= 18) return 17;
  return 8;
}

function chooseJavaPath(requiredMajor, javaInstallations = [], currentJavaPath = "java") {
  const exact = javaInstallations.find((java) => Number(java.major) === requiredMajor);
  const compatible = javaInstallations.find((java) => Number(java.major) > requiredMajor);
  return (exact || compatible)?.path || currentJavaPath || "java";
}

function choosePresetId({ hardware = {}, analysis = {}, accountCount = 1, requestedPresetId = "" }) {
  if (requestedPresetId) return requestedPresetId;
  return classifySystem(hardware).id;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function calculateRamMb(hardware = {}, accountCount = 1, presetId = "") {
  const totalRam = Number(hardware.memory?.totalGb || 0);
  if (accountCount >= 3) {
    if (totalRam <= 8) return 1536;
    if (totalRam <= 16) return 2048;
    return 3072;
  }
  if (presetId === "extreme-fps" && totalRam >= 24) return 6144;
  if (totalRam <= 8) return 2048;
  if (totalRam <= 12) return 3072;
  if (totalRam <= 24) return 4096;
  return 5120;
}

function calculateFpsPlan({ hardware = {}, systemTier = {}, presetId = "", accountCount = 1 }) {
  const refreshRate = Number(hardware.screen?.refreshRate || 60);
  const unplugged = hardware.battery?.state === "discharging";
  const cpuLoad = Number(hardware.cpu?.loadPercent || 0);
  const gpuTier = hardware.gpu?.tier || "unknown";
  const tierId = systemTier.id || "balanced-pc";
  let cap = 165;
  let strategy = "Stable high FPS with good frame pacing.";

  if (tierId === "low-end-pc") {
    cap = refreshRate >= 120 ? 120 : 90;
    strategy = "Capped for stable playable FPS and fewer stutters.";
  } else if (tierId === "balanced-pc") {
    cap = clampNumber(Math.max(144, refreshRate * 2), 144, 240);
    strategy = "High FPS without wasting too much heat or GPU power.";
  } else if (tierId === "gaming-laptop") {
    cap = clampNumber(Math.max(165, refreshRate * 2), 165, 360);
    strategy = "High FPS with laptop thermal safety.";
  } else if (tierId === "high-end-gaming-pc") {
    cap = clampNumber(Math.max(360, refreshRate * 3), 360, 700);
    strategy = "Very high FPS with low input delay and strong frame pacing.";
  } else if (tierId === "extreme-fps-capable") {
    cap = refreshRate >= 240 ? 1000 : 700;
    strategy = "Extreme FPS cap for powerful hardware. Uncapped mode can be enabled manually.";
  }

  if (presetId === "extreme-fps") {
    cap = tierId === "low-end-pc" ? 165 : tierId === "balanced-pc" ? 360 : tierId === "gaming-laptop" ? 500 : 1000;
    strategy = "Extreme FPS preview. Watch heat, fan noise, and frame pacing.";
  }
  if (presetId === "low-end-pc") cap = Math.min(cap, 120);
  if (presetId === "balanced-pc") cap = clampNumber(Math.max(144, refreshRate * 2), 144, 240);
  if (presetId === "gaming-laptop") cap = clampNumber(Math.max(165, refreshRate * 2), 165, 360);
  if (presetId === "high-end-gaming-pc") cap = clampNumber(Math.max(360, refreshRate * 3), 360, 700);

  if (accountCount >= 3 && presetId !== "extreme-fps") {
    cap = Math.min(cap, tierId === "low-end-pc" ? 90 : 165);
    strategy = "Main FPS protected while multiple clients run.";
  }
  if (unplugged && presetId !== "extreme-fps") {
    cap = Math.min(cap, 144);
    strategy = "Battery-aware cap to avoid power throttling and heat spikes.";
  }
  if (cpuLoad >= 85 && presetId !== "extreme-fps") {
    cap = Math.min(cap, 165);
    strategy = "CPU load is high, so FPS is capped for stable frame pacing.";
  }
  if (gpuTier === "low-end-or-integrated" && presetId !== "extreme-fps") {
    cap = Math.min(cap, 120);
    strategy = "Integrated-GPU cap to reduce heat and random FPS drops.";
  }

  return {
    cap: Math.round(cap),
    label: cap >= 1000 ? "1000 FPS / optional uncapped" : `${Math.round(cap)} FPS`,
    refreshRate,
    strategy,
    uncappedAvailable: ["high-end-gaming-pc", "extreme-fps-capable"].includes(tierId) || presetId === "extreme-fps"
  };
}

function clampRecommendedSettings(settings, hardware = {}, context = {}) {
  const totalRam = Number(hardware.memory?.totalGb || 0);
  const { accountCount = 1, fpsPlan = {}, presetId = "" } = context;
  const next = {
    ...settings,
    ramMb: calculateRamMb(hardware, accountCount, presetId),
    fpsCap: fpsPlan.cap || settings.fpsCap
  };
  if (totalRam && totalRam <= 8) {
    next.renderDistance = Math.min(next.renderDistance, 5);
    next.windowWidth = Math.min(next.windowWidth, 1280);
    next.windowHeight = Math.min(next.windowHeight, 720);
  } else if (totalRam && totalRam <= 12) {
    next.renderDistance = Math.min(next.renderDistance, 8);
  }
  if (hardware.gpu?.tier === "low-end-or-integrated") {
    next.shaderEnabled = false;
    next.renderDistance = Math.min(next.renderDistance, 6);
    next.windowWidth = Math.min(next.windowWidth, 1280);
    next.windowHeight = Math.min(next.windowHeight, 720);
    next.entityDistance = Math.min(next.entityDistance, 45);
  }
  if (hardware.battery?.state === "discharging") {
    next.renderDistance = Math.min(next.renderDistance, 5);
    next.simulationDistance = Math.min(next.simulationDistance, 4);
  }
  if (Number(hardware.cpu?.loadPercent || 0) >= 85) {
    next.simulationDistance = Math.min(next.simulationDistance, 4);
  }
  return next;
}

function scoreSetup({ hardware = {}, analysis = {}, accountCount = 1 }) {
  let score = 100;
  for (const flag of analysis.flags || []) {
    score -= flag.severity === "high" ? 16 : flag.severity === "medium" ? 9 : 4;
  }
  const totalRam = Number(hardware.memory?.totalGb || 0);
  if (totalRam && totalRam <= 8 && accountCount > 2) score -= 18;
  if (totalRam && totalRam <= 8) score -= 8;
  if (hardware.gpu?.tier === "low-end-or-integrated") score -= 10;
  if (hardware.storage?.usedPercent >= 90) score -= 10;
  if (hardware.battery?.state === "discharging") score -= 8;
  return Math.max(0, Math.min(100, score));
}

function statusFromScore(score, analysis = {}, hardware = {}) {
  if ((analysis.flags || []).some((flag) => flag.id === "shaders-enabled" || flag.id === "render-distance-high")) return "Heavy FPS Loss Detected";
  if (score >= 86) return "Excellent";
  if (score >= 70) return "Good";
  return "Needs Extreme Optimization";
}

function readableValue(key, value) {
  if (key === "ramMb") return `${Math.round(Number(value) / 1024 * 10) / 10}GB`;
  if (key === "windowWidth") return `${value} width`;
  if (key === "windowHeight") return `${value} height`;
  if (key === "fpsCap") return Number(value) >= 1000 ? `${value} FPS / optional uncapped` : Number(value) <= 0 ? "Smart FPS" : `${value} FPS`;
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return String(value);
}

function settingLabel(key) {
  return {
    ramMb: "RAM",
    fpsCap: "FPS Cap",
    windowWidth: "Resolution Width",
    windowHeight: "Resolution Height",
    renderDistance: "Render Distance",
    simulationDistance: "Simulation Distance",
    entityDistance: "Entity Distance",
    graphicsMode: "Graphics Mode",
    particles: "Particles",
    clouds: "Clouds",
    entityShadows: "Entity Shadows",
    smoothLighting: "Smooth Lighting",
    biomeBlendRadius: "Biome Blend",
    mipmapLevels: "Mipmap Levels",
    vsync: "VSync",
    fullscreen: "Fullscreen",
    shaderEnabled: "Shaders",
    jvmArgs: "JVM Arguments",
    javaPath: "Java Path"
  }[key] || key;
}

function whyForKey(key) {
  return {
    ramMb: "Correct RAM reduces stutter without starving Windows or other Minecraft accounts.",
    fpsCap: "A sensible FPS cap reduces wasted GPU work and heat.",
    windowWidth: "Lower resolution reduces the number of pixels the GPU must draw.",
    windowHeight: "Lower resolution reduces the number of pixels the GPU must draw.",
    renderDistance: "Lowering render distance improves FPS because Minecraft has fewer chunks to render.",
    simulationDistance: "Lower simulation distance improves CPU performance by ticking fewer chunks.",
    entityDistance: "Lower entity distance reduces expensive entity rendering.",
    graphicsMode: "Fast graphics reduces lighting and transparency cost.",
    particles: "Minimal particles reduce visual effects that can stack up during farms or combat.",
    clouds: "Disabling clouds removes an extra render layer.",
    entityShadows: "Disabling entity shadows removes extra rendering work under mobs and players.",
    smoothLighting: "Disabling smooth lighting reduces lighting calculations while rendering chunks.",
    biomeBlendRadius: "Lower biome blend reduces color sampling work during chunk rendering.",
    mipmapLevels: "Lower mipmaps reduce texture memory use.",
    vsync: "Disabling VSync allows Minecraft to render above monitor sync limits.",
    fullscreen: "Windowed mode avoids fullscreen switching overhead and keeps launcher-controlled resolution stable.",
    shaderEnabled: "Disabling shaders improves FPS because shaders are GPU-heavy.",
    jvmArgs: "Stable JVM arguments reduce garbage collection pauses.",
    javaPath: "Using the recommended Java version avoids launch errors and poor runtime compatibility."
  }[key] || "This setting reduces unnecessary client-side workload.";
}

function buildChangeList(current, recommended) {
  const currentByKey = {
    ramMb: current.ramMb,
    fpsCap: current.fpsCap,
    windowWidth: current.resolution.width,
    windowHeight: current.resolution.height,
    renderDistance: current.renderDistance,
    simulationDistance: current.simulationDistance,
    entityDistance: current.entityDistance,
    graphicsMode: current.graphicsMode,
    particles: current.particles,
    clouds: current.clouds,
    entityShadows: current.entityShadows,
    smoothLighting: current.smoothLighting,
    biomeBlendRadius: current.biomeBlendRadius,
    mipmapLevels: current.mipmapLevels,
    vsync: current.vsync,
    fullscreen: current.fullscreen,
    shaderEnabled: current.shaderEnabled,
    jvmArgs: current.jvmArgs,
    javaPath: current.javaPath
  };
  return Object.entries(recommended)
    .filter(([key, value]) => currentByKey[key] !== undefined && String(currentByKey[key]) !== String(value))
    .map(([key, value]) => ({
      key,
      label: settingLabel(key),
      current: readableValue(key, currentByKey[key]),
      recommended: readableValue(key, value),
      why: whyForKey(key)
    }));
}

function buildSuggestions({ current, recommended, hardware, accountCount }) {
  const suggestions = [];
  const add = (title, currentValue, recommendedValue, why, severity = "medium") => {
    suggestions.push({ title, current: currentValue, recommended: recommendedValue, why, severity });
  };

  if (current.renderDistance > recommended.renderDistance) add(
    "Lower render distance",
    current.renderDistance,
    recommended.renderDistance,
    "Lowering render distance improves FPS because Minecraft has fewer chunks to render."
  );
  if (Number(current.fpsCap || 0) !== Number(recommended.fpsCap || 0)) add(
    "Use dynamic FPS cap",
    current.fpsCap ? `${current.fpsCap} FPS` : "Smart FPS",
    Number(recommended.fpsCap) >= 1000 ? `${recommended.fpsCap} FPS or optional uncapped` : `${recommended.fpsCap} FPS`,
    "The cap is calculated from your CPU, GPU, RAM, display refresh rate, power state, and frame pacing risk.",
    "medium"
  );
  if (current.simulationDistance > recommended.simulationDistance) add(
    "Lower simulation distance",
    current.simulationDistance,
    recommended.simulationDistance,
    "Simulation distance is CPU-heavy because the game keeps more chunks active."
  );
  if (current.ramMb > recommended.ramMb) add(
    "Reduce RAM allocation",
    `${Math.round(current.ramMb / 1024 * 10) / 10}GB`,
    `${Math.round(recommended.ramMb / 1024 * 10) / 10}GB`,
    "Minecraft may stutter if RAM is too high because garbage collection pauses can become larger."
  );
  if (current.shaderEnabled) add(
    "Disable shaders",
    "Enabled or installed",
    "Disabled",
    "Disabling shaders improves FPS because shaders are GPU-heavy.",
    "high"
  );
  if (current.vsync) add(
    "Disable VSync",
    "Enabled",
    "Disabled",
    "VSync can cap FPS and add input latency.",
    "medium"
  );
  if (current.highResolutionPacks?.length) add(
    "Use 16x or 32x resource packs",
    `${current.highResolutionPacks.length} high-res pack(s)`,
    "16x or 32x packs",
    "High-resolution resource packs use more VRAM and memory bandwidth.",
    "medium"
  );
  if (recommended.javaPath && current.javaPath !== recommended.javaPath) add(
    "Use a better Java path",
    current.javaPath || "java",
    recommended.javaPath,
    "The selected Java version may not be ideal for this Minecraft version.",
    "medium"
  );
  if (hardware.gpu?.tier === "low-end-or-integrated") add(
    "Use integrated-GPU FPS visuals",
    hardware.gpu.names?.join(", ") || "Integrated GPU",
    "No shaders, low render distance",
    "Integrated GPUs benefit most from fewer chunks, fewer pixels, and no shaders.",
    "high"
  );
  if (accountCount > 1) add(
    "Protect main FPS with lighter extra accounts",
    `${accountCount} account(s)`,
    "Extra accounts at lower resolution and FPS",
    "Reducing extra account load keeps more CPU/GPU headroom for maximum FPS on the account you are watching.",
    "medium"
  );
  if (hardware.battery?.state === "discharging") add(
    "Plug in for maximum FPS",
    "Unplugged",
    "Use AC power while playing",
    "Laptop battery mode often limits CPU/GPU boost clocks, lowering maximum FPS.",
    "medium"
  );
  if (Number(hardware.cpu?.loadPercent) >= 80) add(
    "Lower CPU-heavy settings",
    `${hardware.cpu.loadPercent}% CPU load`,
    "Lower simulation distance and FPS cap",
    "When CPU usage is high, Minecraft has less time to tick chunks and prepare frames.",
    "high"
  );
  if (hardware.storage?.usedPercent >= 90) add(
    "Free disk space",
    `${hardware.storage.usedPercent}% used`,
    "Keep at least 10GB free",
    "Minecraft may lag or fail downloads when storage is almost full.",
    "medium"
  );

  suggestions.push({
    title: "Close heavy background apps",
    current: "Unknown background load",
    recommended: "Close browsers, recorders, and launchers you do not need",
    why: "Background apps can compete for CPU, RAM, disk, and GPU resources.",
    severity: "low"
  });

  return suggestions;
}

function buildBeforeAfter(current, recommended) {
  return {
    current: [
      ["RAM", `${Math.round(current.ramMb / 1024 * 10) / 10}GB`],
      ["Render Distance", current.renderDistance],
      ["Simulation Distance", current.simulationDistance],
      ["FPS", current.fpsCap ? current.fpsCap : "Smart FPS"],
      ["Shaders", current.shaderEnabled ? "Enabled/installed" : "Disabled"],
      ["Resolution", current.resolution.label]
    ],
    recommended: [
      ["RAM", `${Math.round(recommended.ramMb / 1024 * 10) / 10}GB`],
      ["Render Distance", recommended.renderDistance],
      ["Simulation Distance", recommended.simulationDistance],
      ["FPS", Number(recommended.fpsCap) >= 1000 ? `${recommended.fpsCap} / uncapped optional` : recommended.fpsCap || "Unlimited"],
      ["Shaders", recommended.shaderEnabled ? "Enabled" : "Disabled"],
      ["Resolution", `${recommended.windowWidth}x${recommended.windowHeight}`]
    ]
  };
}

function buildMultiAccountRecommendation(accounts = [], hardware = {}, taggedAccountId = "", recommended = {}) {
  const totalRam = Number(hardware.memory?.totalGb || 0);
  const maxRecommendedAccounts = totalRam && totalRam <= 8 ? 2 : totalRam && totalRam <= 12 ? 3 : 5;
  const ordered = [...accounts].sort((a, b) => {
    if (a.id === taggedAccountId) return -1;
    if (b.id === taggedAccountId) return 1;
    return 0;
  });
  return {
    maxRecommendedAccounts,
    reason: totalRam && totalRam <= 8
      ? "8GB RAM systems should keep extra clients limited so the main account can hold maximum FPS."
      : totalRam && totalRam <= 12
        ? "12GB RAM systems can run a few clients, but extra clients should stay lighter than the main one."
        : totalRam && totalRam <= 16
          ? "16GB RAM systems can run several clients, but the main account should keep the Extreme Performance profile."
        : "Higher RAM systems can run more clients, but GPU and CPU still decide maximum FPS.",
    accounts: ordered.map((account, index) => index === 0 ? {
      accountId: account.id,
      name: account.name,
      role: "Main FPS Account",
      ramMb: recommended.ramMb || 4096,
      fpsCap: recommended.fpsCap || 165,
      width: recommended.windowWidth || 1280,
      height: recommended.windowHeight || 720,
      renderDistance: recommended.renderDistance || 8,
      simulationDistance: recommended.simulationDistance || 5,
      why: "The watched account keeps the strongest FPS budget chosen for this system."
    } : {
      accountId: account.id,
      name: account.name,
      role: `Extra Account ${index}`,
      ramMb: totalRam && totalRam <= 8 ? 1536 : 2048,
      fpsCap: 30,
      width: 854,
      height: 480,
      renderDistance: 4,
      simulationDistance: 4,
      why: "Extra accounts use lower FPS, resolution, and distance so the main FPS account stays smooth."
    })
  };
}

function buildRecommendations(context = {}) {
  const { hardware = {}, analysis = {}, accounts = [], settings = {}, requestedPresetId = "" } = context;
  const accountCount = Math.max(1, accounts.length || 1);
  const systemTier = classifySystem(hardware);
  const presetId = choosePresetId({ hardware, analysis, accountCount, requestedPresetId });
  const preset = getPreset(presetId);
  const requiredJavaMajor = inferJavaMajor(analysis.current?.minecraftVersionId || settings.minecraftVersionId);
  const javaPath = chooseJavaPath(requiredJavaMajor, hardware.javaInstallations || [], analysis.current?.javaPath || settings.javaPath);
  const fpsPlan = calculateFpsPlan({ hardware, systemTier, presetId, accountCount });
  const recommended = clampRecommendedSettings({ ...preset.settings, javaPath }, hardware, { accountCount, fpsPlan, presetId });
  const score = scoreSetup({ hardware, analysis, accountCount });
  const status = statusFromScore(score, analysis, hardware);
  const changes = buildChangeList(analysis.current, recommended);
  const multiAccount = buildMultiAccountRecommendation(accounts, hardware, settings.taggedAccountId, recommended);

  return {
    score,
    status,
    systemTier,
    fpsPlan,
    selectedPresetId: preset.id,
    selectedPreset: preset,
    requiredJavaMajor,
    recommended,
    changes,
    suggestions: buildSuggestions({ current: analysis.current, recommended, hardware, accountCount }),
    beforeAfter: buildBeforeAfter(analysis.current, recommended),
    multiAccount,
    recommendedMods: analysis.current?.modloader === "fabric" ? performanceMods : [],
    presets: optimizerPresets,
    advancedModes,
    safeWarnings: [
      "Do not use fake movement.",
      "Do not bypass server idle systems.",
      "Do not send hidden packets.",
      "Do not auto-send chat messages.",
      "Only optimize legal client-side performance settings."
    ]
  };
}

module.exports = {
  buildRecommendations,
  inferJavaMajor
};
