function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifySystem(hardware = {}) {
  const totalRam = Number(hardware.memory?.totalGb || 0);
  const cores = Number(hardware.cpu?.logicalCores || hardware.cpu?.threads || 0);
  const gpuTier = hardware.gpu?.tier || "unknown";
  const gpuText = (hardware.gpu?.names || []).join(" ").toLowerCase();
  const vramGb = Number(hardware.gpu?.vramGb || 0);
  const refreshRate = Number(hardware.screen?.refreshRate || 60);
  const hasBattery = !["desktop-or-unknown", "unknown"].includes(hardware.battery?.state || "unknown");
  const dedicatedGpu = ["mid-range", "dedicated-or-modern", "extreme"].includes(gpuTier);
  const strongGpuName = includesAny(gpuText, [/rtx\s?(30|40|50)/, /rx\s?(6|7|8|9)\d{3}/, /radeon.*(6800|6900|7800|7900)/]);

  if (totalRam <= 8 || (gpuTier === "low-end-or-integrated" && cores <= 4)) {
    return {
      id: "low-end-pc",
      name: "Low-end PC",
      description: "Prioritize stable playable FPS, low stutter, low heat, and safe memory usage.",
      stableFpsRange: [60, 120],
      maxFpsRange: [90, 165],
      thermalRisk: hasBattery ? "medium" : "low"
    };
  }

  if (hasBattery && dedicatedGpu) {
    return {
      id: "gaming-laptop",
      name: "Gaming laptop",
      description: "Push high FPS while keeping thermals, battery mode, and frame pacing under control.",
      stableFpsRange: [144, 240],
      maxFpsRange: refreshRate >= 240 ? [240, 500] : [165, 360],
      thermalRisk: hardware.battery?.state === "discharging" ? "high" : "medium"
    };
  }

  if ((gpuTier === "extreme" || strongGpuName || vramGb >= 10) && totalRam >= 24 && cores >= 12) {
    return {
      id: "extreme-fps-capable",
      name: "Extreme FPS capable",
      description: "Hardware can attempt very high FPS caps or uncapped mode with user confirmation.",
      stableFpsRange: [240, 500],
      maxFpsRange: [700, 1000],
      thermalRisk: "medium"
    };
  }

  if ((gpuTier === "dedicated-or-modern" || vramGb >= 6) && totalRam >= 16 && cores >= 8) {
    return {
      id: "high-end-gaming-pc",
      name: "High-end gaming PC",
      description: "High FPS with stronger render distance and smooth frame pacing.",
      stableFpsRange: [240, 360],
      maxFpsRange: [360, 700],
      thermalRisk: "low"
    };
  }

  return {
    id: "balanced-pc",
    name: "Balanced PC",
    description: "High FPS with safe settings and good visual stability.",
    stableFpsRange: [120, 165],
    maxFpsRange: [165, 240],
    thermalRisk: hasBattery ? "medium" : "low"
  };
}

module.exports = {
  classifySystem
};
