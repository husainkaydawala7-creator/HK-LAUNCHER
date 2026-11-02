const performanceMods = [
  {
    name: "Sodium",
    loader: "Fabric",
    use: "FPS boost",
    why: "Improves Minecraft's rendering pipeline, which is usually the biggest FPS bottleneck."
  },
  {
    name: "Lithium",
    loader: "Fabric",
    use: "Game logic optimization",
    why: "Optimizes game logic and server-side calculations inside the client, helping CPU-limited systems."
  },
  {
    name: "FerriteCore",
    loader: "Fabric",
    use: "RAM optimization",
    why: "Reduces memory usage so Minecraft has less garbage collection pressure."
  },
  {
    name: "ImmediatelyFast",
    loader: "Fabric",
    use: "Rendering optimization",
    why: "Optimizes common UI and rendering paths for smoother frame delivery."
  },
  {
    name: "EntityCulling",
    loader: "Fabric",
    use: "Entity rendering culling",
    why: "Skips entities you cannot see, reducing wasted GPU work."
  },
  {
    name: "ModernFix",
    loader: "Fabric",
    use: "Startup and memory fixes",
    why: "Fixes memory and loading inefficiencies in modern Minecraft versions."
  },
  {
    name: "Krypton",
    loader: "Fabric",
    use: "Networking optimization",
    why: "Improves networking efficiency without adding anti-kick or hidden packet behavior."
  },
  {
    name: "Dynamic FPS",
    loader: "Fabric",
    use: "Background FPS control",
    why: "Reduces wasted rendering when Minecraft is unfocused, improving overall system smoothness."
  },
  {
    name: "More Culling",
    loader: "Fabric",
    use: "Extra block/entity culling",
    why: "Avoids rendering more hidden geometry, improving FPS in complex scenes."
  },
  {
    name: "Fabric API",
    loader: "Fabric",
    use: "Fabric dependency",
    why: "Many Fabric performance mods require it to load correctly."
  },
  {
    name: "Mod Menu",
    loader: "Fabric",
    use: "Mod settings UI",
    why: "Makes it easier to inspect and configure installed Fabric mods."
  }
];

const optimizerPresets = [
  {
    id: "low-end-pc",
    name: "Low-end PC",
    statusHint: "Stable FPS",
    fpsDescription: "60-120 FPS stability target",
    description: "Stable playable FPS for weak PCs, integrated GPUs, and 8GB RAM systems.",
    settings: {
      ramMb: 2048,
      fpsCap: 90,
      windowWidth: 854,
      windowHeight: 480,
      renderDistance: 4,
      simulationDistance: 4,
      entityDistance: 35,
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
      jvmArgs: "-XX:+UseG1GC -XX:MaxGCPauseMillis=100"
    }
  },
  {
    id: "balanced-pc",
    name: "Balanced PC",
    statusHint: "High FPS",
    fpsDescription: "144-240 FPS target",
    description: "High FPS with stable frame pacing for mid-range desktops and laptops.",
    settings: {
      ramMb: 3072,
      fpsCap: 165,
      windowWidth: 1280,
      windowHeight: 720,
      renderDistance: 8,
      simulationDistance: 5,
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
      jvmArgs: "-XX:+UseG1GC -XX:+UseStringDeduplication"
    }
  },
  {
    id: "gaming-laptop",
    name: "Gaming Laptop",
    statusHint: "Thermal-aware FPS",
    fpsDescription: "165-500 FPS depending on display and power",
    description: "High FPS with laptop thermal and battery safety rules.",
    settings: {
      ramMb: 4096,
      fpsCap: 240,
      windowWidth: 1280,
      windowHeight: 720,
      renderDistance: 8,
      simulationDistance: 5,
      entityDistance: 60,
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
      jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M"
    }
  },
  {
    id: "high-end-gaming-pc",
    name: "High-end Gaming PC",
    statusHint: "Very high FPS",
    fpsDescription: "360-700 FPS target",
    description: "Very high FPS for strong CPUs, dedicated GPUs, and 16GB+ RAM systems.",
    settings: {
      ramMb: 4096,
      fpsCap: 500,
      windowWidth: 1920,
      windowHeight: 1080,
      renderDistance: 10,
      simulationDistance: 6,
      entityDistance: 70,
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
  },
  {
    id: "extreme-fps",
    name: "Extreme FPS Mode",
    statusHint: "Extreme FPS",
    fpsDescription: "700-1000+ FPS or uncapped optional",
    description: "Experimental high-cap profile for powerful gaming systems with user confirmation.",
    settings: {
      ramMb: 6144,
      fpsCap: 1000,
      windowWidth: 1920,
      windowHeight: 1080,
      renderDistance: 8,
      simulationDistance: 5,
      entityDistance: 65,
      graphicsMode: "fast",
      particles: "minimal",
      clouds: "false",
      entityShadows: false,
      smoothLighting: false,
      biomeBlendRadius: 0,
      mipmapLevels: 0,
      vsync: false,
      fullscreen: true,
      shaderEnabled: false,
      jvmArgs: "-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=15 -XX:MaxGCPauseMillis=30 -XX:G1HeapRegionSize=32M"
    }
  }
];

const advancedModes = [
  { id: "auto-smart", name: "Auto Smart Mode", description: "Automatically picks the best profile for the detected system." },
  { id: "extreme-fps", name: "Extreme FPS Mode", description: "Allows very high FPS caps on capable systems." },
  { id: "stable-fps", name: "Stable FPS Mode", description: "Caps FPS for smooth frame pacing and fewer drops." },
  { id: "low-latency", name: "Low Latency Mode", description: "Prioritizes input delay with VSync off and high FPS headroom." },
  { id: "multi-account", name: "Multi-account Performance Mode", description: "Protects the main account by lowering extra account load." },
  { id: "battery-saver", name: "Battery Saver Mode", description: "Reduces heat and power use on unplugged laptops." },
  { id: "auto-ram", name: "Auto RAM Mode", description: "Allocates enough memory without starving Windows." },
  { id: "auto-graphics", name: "Auto Graphics Optimization", description: "Chooses render distance, particles, shadows, and resolution automatically." },
  { id: "fabric-mods", name: "Fabric Performance Mod Mode", description: "Recommends Sodium/Lithium-style mods with explanations." }
];

function getPreset(presetId) {
  return optimizerPresets.find((preset) => preset.id === presetId) || optimizerPresets[1];
}

module.exports = {
  optimizerPresets,
  advancedModes,
  performanceMods,
  getPreset
};
