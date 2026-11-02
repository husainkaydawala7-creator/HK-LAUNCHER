function bytesToGb(bytes) {
  if (!Number.isFinite(Number(bytes))) return null;
  return Math.round((Number(bytes) / 1024 / 1024 / 1024) * 10) / 10;
}

function getResolution(settings = {}, profile = {}) {
  const width = Number(settings.windowWidth || profile.width || 960);
  const height = Number(settings.windowHeight || profile.height || 540);
  return { width, height, label: `${width}x${height}` };
}

function looksHighResolutionPack(fileName = "") {
  return /(64x|128x|256x|512x|1024x|high.?res|hd|ultra)/i.test(fileName);
}

function normalizeCurrentSettings({ settings = {}, profile = {}, content = {}, modAnalysis = {} }) {
  const resolution = getResolution(settings, profile);
  const resourcepacks = content.resourcepacks || [];
  const shaderpacks = content.shaderpacks || [];
  const mods = content.mods || modAnalysis.files || [];
  return {
    minecraftVersionId: profile.minecraftVersionId || settings.minecraftVersionId || "latest-compatible",
    modloader: profile.modloader || settings.modloader || "vanilla",
    ramMb: Number(settings.ramMb || profile.ramMb || 2048),
    fpsCap: Number(settings.fpsCap || profile.fpsCap || 60),
    renderDistance: Number(settings.renderDistance || profile.renderDistance || 8),
    simulationDistance: Number(settings.simulationDistance || profile.simulationDistance || 4),
    entityDistance: Number(settings.entityDistance || profile.entityDistance || 50),
    resolution,
    graphicsMode: settings.graphicsMode || profile.graphicsMode || "fast",
    particles: settings.particles || profile.particles || "minimal",
    clouds: settings.clouds || profile.clouds || "false",
    entityShadows: settings.entityShadows !== undefined ? Boolean(settings.entityShadows) : Boolean(profile.entityShadows),
    smoothLighting: settings.smoothLighting !== undefined ? Boolean(settings.smoothLighting) : Boolean(profile.smoothLighting),
    biomeBlendRadius: Number(settings.biomeBlendRadius ?? profile.biomeBlendRadius ?? 0),
    mipmapLevels: Number(settings.mipmapLevels ?? profile.mipmapLevels ?? 0),
    vsync: Boolean(settings.vsync),
    fullscreen: Boolean(settings.fullscreen),
    shaderEnabled: Boolean(settings.shaderEnabled) || shaderpacks.length > 0,
    jvmArgs: settings.jvmArgs || profile.jvmArgs || "-XX:+UseG1GC",
    javaPath: settings.javaPath || "java",
    mods,
    resourcepacks,
    shaderpacks,
    highResolutionPacks: resourcepacks.filter((file) => looksHighResolutionPack(file.name || "")),
    modWarnings: modAnalysis.warnings || []
  };
}

function analyzeSettings(context = {}) {
  const current = normalizeCurrentSettings(context);
  const flags = [];
  const push = (id, severity, title, why) => flags.push({ id, severity, title, why });

  if (current.renderDistance > 12) {
    push("render-distance-high", "high", "Render distance is high", "Minecraft must draw more chunks each frame, which costs CPU and GPU time.");
  }
  if (current.simulationDistance > 8) {
    push("simulation-distance-high", "medium", "Simulation distance is high", "More simulated chunks increase CPU work even when they are not visible.");
  }
  if (current.ramMb > 6144) {
    push("ram-too-high", "medium", "RAM allocation is high", "Too much RAM can increase garbage collection pauses and leave less memory for Windows.");
  }
  if (current.ramMb < 1536) {
    push("ram-too-low", "medium", "RAM allocation is low", "Minecraft can stutter or crash when it does not have enough memory.");
  }
  if (current.fpsCap > 700) {
    push("fps-unlimited", "medium", "FPS is uncapped or very high", "Uncapped FPS can waste GPU power and increase heat.");
  }
  if (current.shaderEnabled) {
    push("shaders-enabled", "high", "Shaders are installed or enabled", "Shaders are GPU-heavy and can cut FPS heavily on laptops.");
  }
  if (current.vsync) {
    push("vsync-enabled", "medium", "VSync is enabled", "VSync can limit FPS and add input latency.");
  }
  if (current.smoothLighting) {
    push("smooth-lighting", "low", "Smooth lighting is enabled", "Smooth lighting adds extra rendering cost.");
  }
  if (current.biomeBlendRadius > 0) {
    push("biome-blend", "low", "Biome blend is enabled", "Biome blending increases color sampling work while chunks render.");
  }
  if (current.highResolutionPacks.length) {
    push("high-res-pack", "medium", "High-resolution resource pack detected", "Large textures use more VRAM and memory bandwidth.");
  }
  if (current.modloader === "fabric" && !current.mods.some((file) => /sodium/i.test(file.name || ""))) {
    push("missing-sodium", "low", "Sodium is not detected", "Sodium is one of the most useful Fabric FPS mods.");
  }
  if (current.modWarnings.length) {
    push("mod-warnings", "medium", "Mod compatibility warnings exist", "Wrong loader or duplicate mods can cause crashes and poor performance.");
  }

  return {
    current,
    flags,
    contentCounts: {
      mods: current.mods.length,
      resourcepacks: current.resourcepacks.length,
      shaderpacks: current.shaderpacks.length,
      highResolutionPacks: current.highResolutionPacks.length
    },
    memoryGb: bytesToGb(context.hardware?.memory?.totalBytes)
  };
}

module.exports = {
  analyzeSettings
};
