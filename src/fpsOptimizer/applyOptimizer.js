const optimizerKeys = [
  "ramMb",
  "fpsCap",
  "windowWidth",
  "windowHeight",
  "renderDistance",
  "simulationDistance",
  "entityDistance",
  "graphicsMode",
  "particles",
  "clouds",
  "entityShadows",
  "smoothLighting",
  "biomeBlendRadius",
  "mipmapLevels",
  "vsync",
  "fullscreen",
  "shaderEnabled",
  "jvmArgs",
  "javaPath"
];

function pickOptimizerSettings(recommended = {}) {
  return Object.fromEntries(
    optimizerKeys
      .filter((key) => recommended[key] !== undefined && recommended[key] !== null && recommended[key] !== "")
      .map((key) => [key, recommended[key]])
  );
}

function buildChangeSummary(previous = {}, next = {}) {
  return optimizerKeys
    .filter((key) => String(previous[key]) !== String(next[key]) && next[key] !== undefined)
    .map((key) => ({ key, from: previous[key], to: next[key] }));
}

function buildAccountOverrides(accounts = [], multiAccount = {}) {
  const next = {};
  for (const recommendation of multiAccount.accounts || []) {
    next[recommendation.accountId] = {
      label: recommendation.role,
      ramMb: recommendation.ramMb,
      fpsCap: recommendation.fpsCap,
      width: recommendation.width,
      height: recommendation.height,
      renderDistance: recommendation.renderDistance,
      simulationDistance: recommendation.simulationDistance
    };
  }
  return next;
}

function applyRecommendedSettings({ currentSettings = {}, currentOverrides = {}, recommendation = {}, accounts = [], applyPerAccount = true }) {
  const optimizedSettings = pickOptimizerSettings(recommendation.recommended || {});
  const nextSettings = {
    ...currentSettings,
    ...optimizedSettings,
    optimizedAt: new Date().toISOString(),
    optimizerPresetId: recommendation.selectedPresetId || ""
  };
  const shouldApplyAccountOverrides = applyPerAccount && accounts.length > 1;
  const nextOverrides = shouldApplyAccountOverrides
    ? { ...currentOverrides, ...buildAccountOverrides(accounts, recommendation.multiAccount) }
    : { ...currentOverrides };
  return {
    settings: nextSettings,
    accountOverrides: nextOverrides,
    changes: buildChangeSummary(currentSettings, nextSettings),
    accountOverrideCount: shouldApplyAccountOverrides ? Object.keys(buildAccountOverrides(accounts, recommendation.multiAccount)).length : 0
  };
}

function resetOptimizerSettings({ currentSettings = {}, defaultSettings = {}, baselineSettings = null }) {
  const source = baselineSettings || defaultSettings;
  const resetValues = pickOptimizerSettings(source);
  const nextSettings = { ...currentSettings, ...resetValues };
  delete nextSettings.optimizedAt;
  delete nextSettings.optimizerPresetId;
  return {
    settings: nextSettings,
    changes: buildChangeSummary(currentSettings, nextSettings)
  };
}

module.exports = {
  optimizerKeys,
  applyRecommendedSettings,
  resetOptimizerSettings
};
