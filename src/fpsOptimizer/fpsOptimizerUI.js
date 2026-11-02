function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unknown";
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}MB`;
  return `${Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10}GB`;
}

function statusClass(status = "") {
  const normalized = status.toLowerCase();
  if (normalized.includes("excellent")) return "excellent";
  if (normalized.includes("good")) return "good";
  if (normalized.includes("heavy")) return "heavy";
  return "needs";
}

function gpuTierLabel(tier = "unknown") {
  return {
    "dedicated-or-modern": "dedicated or modern GPU",
    "mid-range": "mid-range GPU",
    "low-end-or-integrated": "integrated GPU",
    unknown: "unknown GPU tier"
  }[tier] || "unknown GPU tier";
}

function buildHardwareCards(hardware = {}) {
  return [
    { label: "CPU", value: hardware.cpu?.model || "Unknown", detail: `${hardware.cpu?.logicalCores || 0} logical cores${hardware.cpu?.loadPercent == null ? "" : ` | ${hardware.cpu.loadPercent}% load`}` },
    { label: "GPU", value: hardware.gpu?.names?.join(", ") || "Unknown GPU", detail: `${gpuTierLabel(hardware.gpu?.tier)}${hardware.gpu?.vramGb ? ` | ${hardware.gpu.vramGb}GB VRAM` : ""}` },
    { label: "RAM", value: `${hardware.memory?.totalGb || "?"}GB total`, detail: `${hardware.memory?.freeGb || "?"}GB free now` },
    { label: "OS", value: `${hardware.os?.platform || "OS"} ${hardware.os?.release || ""}`, detail: hardware.os?.arch || "" },
    { label: "Screen", value: hardware.screen?.width ? `${hardware.screen.width}x${hardware.screen.height}` : "Unknown", detail: `${hardware.screen?.refreshRate || "?"}Hz | ${hardware.screen?.scaleFactor || 1}x scale` },
    { label: "Storage", value: formatBytes(hardware.storage?.freeBytes), detail: `${hardware.storage?.type || "unknown"}${hardware.storage?.usedPercent == null ? "" : ` | ${hardware.storage.usedPercent}% used`}` },
    { label: "Power", value: hardware.battery?.label || "Unknown", detail: hardware.battery?.percent == null ? "" : `${hardware.battery.percent}% battery` },
    { label: "Java", value: `${hardware.javaInstallations?.length || 0} detected`, detail: (hardware.javaInstallations || []).map((java) => `Java ${java.major}`).join(", ") || "Use Java Manager" }
  ];
}

function buildOptimizerViewModel({ hardware, analysis, recommendation }) {
  return {
    hardware,
    analysis,
    recommendation,
    statusClass: statusClass(recommendation.status),
    hardwareCards: buildHardwareCards(hardware),
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildOptimizerViewModel
};
