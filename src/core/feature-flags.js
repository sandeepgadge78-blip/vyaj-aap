// व्याज Infinity X - Adaptive Feature Manager व 3 Operating Modes (Simple / Pro / Ultra) (src/core/feature-flags.js)

const STORAGE_KEY = "vyaj_infinity_modes_v1";

// हे ४ सुरक्षा व विश्वासार्हतेचे नियम कोणत्याही मोडमध्ये कधीही बंद होत नाहीत
export const ALWAYS_ON_GUARDS = Object.freeze({
  securityPinAndAuth: true,
  financialValidation: true,
  duplicateProtection: true,
  backupAndAudit: true
});

export const OPERATING_MODES = Object.freeze({
  simple: {
    id: "simple",
    labelMr: "Simple Mode",
    descMr: "दैनंदिन स्वच्छ हिशोब (डॅशबोर्ड, ग्राहक, व्याज वसुली, PDF)",
    features: {
      udhaari: true,
      monthActivity: true,
      interestPreview: true,
      emiCalculator: true,
      cashbook: false,
      bankingV16Controls: false,
      analyticsCharts: false,
      systemGuardian: false,
      timeMachine: false,
      versionCompare: false,
      simulationMode: false,
      voiceAndOcr: false
    }
  },
  pro: {
    id: "pro",
    labelMr: "Pro Mode",
    descMr: "व्यवसाय व्यवस्थापन (Simple + बँकिंग V16, कॅशबुक, Analytics, डॉक्युमेंट्स)",
    features: {
      udhaari: true,
      monthActivity: true,
      interestPreview: true,
      emiCalculator: true,
      cashbook: true,
      bankingV16Controls: true,
      analyticsCharts: true,
      systemGuardian: true,
      timeMachine: false,
      versionCompare: true,
      simulationMode: false,
      voiceAndOcr: false
    }
  },
  ultra: {
    id: "ultra",
    labelMr: "Super Ultra Mode",
    descMr: "संपूर्ण नियंत्रण केंद्र (Pro + Time Machine, Simulation, Error Detector, Offline Queue)",
    features: {
      udhaari: true,
      monthActivity: true,
      interestPreview: true,
      emiCalculator: true,
      cashbook: true,
      bankingV16Controls: true,
      analyticsCharts: true,
      systemGuardian: true,
      timeMachine: true,
      versionCompare: true,
      simulationMode: true,
      voiceAndOcr: true
    }
  }
});

let currentConfig = loadSavedConfig();
const listeners = new Set();

function loadSavedConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && OPERATING_MODES[raw.mode]) {
      return {
        mode: raw.mode,
        overrides: raw.overrides && typeof raw.overrides === "object" ? raw.overrides : {}
      };
    }
  } catch (_) {}
  return { mode: "pro", overrides: {} };
}

function persistConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
  } catch (_) {}
}

function notify() {
  const snap = getFeatureState();
  listeners.forEach((fn) => {
    try { fn(snap); } catch (err) { console.warn("FeatureFlag Listener Error:", err); }
  });
}

export function getOperatingMode() {
  return currentConfig.mode;
}

export function setOperatingMode(modeId) {
  if (!OPERATING_MODES[modeId]) return false;
  currentConfig = { mode: modeId, overrides: {} };
  persistConfig();
  notify();
  return true;
}

export function setFeatureOverride(featureKey, enabled) {
  if (Object.prototype.hasOwnProperty.call(ALWAYS_ON_GUARDS, featureKey)) {
    return false; // सुरक्षा व बॅकअप नियम कधीही बंद करता येणार नाहीत
  }
  currentConfig.overrides = { ...currentConfig.overrides, [featureKey]: Boolean(enabled) };
  persistConfig();
  notify();
  return true;
}

export function isFeatureEnabled(featureKey) {
  if (Object.prototype.hasOwnProperty.call(ALWAYS_ON_GUARDS, featureKey)) return true;
  if (Object.prototype.hasOwnProperty.call(currentConfig.overrides, featureKey)) {
    return Boolean(currentConfig.overrides[featureKey]);
  }
  const preset = OPERATING_MODES[currentConfig.mode] || OPERATING_MODES.pro;
  return Boolean(preset.features[featureKey]);
}

export function getFeatureState() {
  const preset = OPERATING_MODES[currentConfig.mode] || OPERATING_MODES.pro;
  return {
    mode: currentConfig.mode,
    modeMeta: preset,
    guards: ALWAYS_ON_GUARDS,
    features: { ...preset.features, ...currentConfig.overrides }
  };
}

export function subscribeFeatureFlags(fn) {
  if (typeof fn === "function") listeners.add(fn);
  return () => listeners.delete(fn);
}
