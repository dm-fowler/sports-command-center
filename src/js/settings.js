// src/js/settings.js
// ------------------------------------------------------------
// Phone-friendly settings editor.
// Saves override JSON to the local server so dashboard can load it.
// ------------------------------------------------------------

import { CONFIG, getSettingsServerBaseUrl } from "./config.js";

const settingsBaseUrl = getSettingsServerBaseUrl();
const form = document.getElementById("settingsForm");
const resetButton = document.getElementById("resetButton");
const statusMessage = document.getElementById("statusMessage");
const settingsServerUrl = document.getElementById("settingsServerUrl");

let resolvedConfig = deepClone(CONFIG);

init();

async function init() {
  if (settingsServerUrl) {
    settingsServerUrl.textContent = settingsBaseUrl;
  }

  try {
    const overrides = await fetchSavedOverrides();
    resolvedConfig = deepMerge(deepClone(CONFIG), overrides);
    populateFormFromConfig(resolvedConfig);
    showMessage("Loaded saved settings.", "info");
  } catch (error) {
    resolvedConfig = deepClone(CONFIG);
    populateFormFromConfig(resolvedConfig);
    showMessage(`Could not load saved settings. Using defaults. (${error.message})`, "error");
  }

  form?.addEventListener("submit", onSaveSettings);
  resetButton?.addEventListener("click", onResetOverrides);
}

async function onSaveSettings(event) {
  event.preventDefault();

  try {
    const overrides = buildOverridesFromForm();
    await saveOverrides(overrides);

    resolvedConfig = deepMerge(deepClone(CONFIG), overrides);
    showMessage("Settings saved. Refresh the dashboard page to apply changes.", "info");
  } catch (error) {
    showMessage(`Save failed: ${error.message}`, "error");
  }
}

async function onResetOverrides() {
  try {
    await fetch(`${settingsBaseUrl}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    resolvedConfig = deepClone(CONFIG);
    populateFormFromConfig(resolvedConfig);
    showMessage("Overrides reset. Dashboard will use config.js defaults.", "info");
  } catch (error) {
    showMessage(`Reset failed: ${error.message}`, "error");
  }
}

async function fetchSavedOverrides() {
  const response = await fetch(`${settingsBaseUrl}/overrides`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  return isPlainObject(payload?.overrides) ? payload.overrides : {};
}

async function saveOverrides(overrides) {
  const response = await fetch(`${settingsBaseUrl}/overrides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overrides),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;

    try {
      const payload = await response.json();
      if (payload?.details) {
        detail = payload.details;
      }
    } catch (error) {
      // Ignore parse failure and keep default detail text.
    }

    throw new Error(detail);
  }
}

function populateFormFromConfig(config) {
  setNumber("refreshIntervalSeconds", Math.round(config.API.REFRESH_INTERVAL_MS / 1000));
  setNumber("tickerCycleSeconds", Math.round(config.TICKER.cycleIntervalMs / 1000));
  setNumber("gridColumns", config.TV_LAYOUT.columns);
  setNumber("gridRows", config.TV_LAYOUT.rows);

  setNumber("statusLive", config.STATUS_WEIGHTS.LIVE);
  setNumber("statusUpcoming", config.STATUS_WEIGHTS.UPCOMING);
  setNumber("statusFinal", config.STATUS_WEIGHTS.FINAL);

  setNumber("bonusRankedGame", config.BONUS_WEIGHTS.rankedGame);
  setNumber("bonusBothTeamsRanked", config.BONUS_WEIGHTS.bothTeamsRanked);
  setNumber("bonusCloseGame", config.BONUS_WEIGHTS.closeGame);
  setNumber("bonusCloseLateGame", config.BONUS_WEIGHTS.closeLateGame);

  setNumber("penaltyFinalGame", config.PENALTY_WEIGHTS.finalGame);
  setNumber("penaltyLiveBlowout", config.PENALTY_WEIGHTS.liveBlowout);
  setNumber("penaltyLiveLowInterest", config.PENALTY_WEIGHTS.liveLowInterest);

  setNumber("closeMargin", config.CLOSE_GAME_RULES.closeMargin);
  setNumber("blowoutMargin", config.BLOWOUT_RULES.blowoutMargin);
  setChecked("upcomingTipoffProximityEnabled", config.UPCOMING_TIPOFF_PROXIMITY.enabled);
  setNumber(
    "upcomingTipoffHorizonMinutes",
    config.UPCOMING_TIPOFF_PROXIMITY.horizonMinutes
  );
  setNumber("upcomingTipoffMaxBonus", config.UPCOMING_TIPOFF_PROXIMITY.maxBonus);

  setChecked("finalHoldEnabled", config.FINAL_HOLD.enabled);
  setNumber("finalHoldMinutes", config.FINAL_HOLD.holdMinutes);
  setNumber("finalHoldMaxBonus", config.FINAL_HOLD.maxBonus);

  setChecked("progressBoostEnabled", config.PROGRESS_BOOST.enabled);
  setNumber("progressSecondHalfBonus", config.PROGRESS_BOOST.secondHalfBonus);
  setNumber("progressOvertimeBonus", config.PROGRESS_BOOST.overtimeBonus);
  setNumber("progressMaxClockBonus", config.PROGRESS_BOOST.maxClockProgressBonus);

  setText("teamWeightsJson", JSON.stringify(config.TEAM_WEIGHTS, null, 2));
  setText("conferenceWeightsJson", JSON.stringify(config.CONFERENCE_WEIGHTS, null, 2));
}

function buildOverridesFromForm() {
  const teamWeights = parseJsonObject("teamWeightsJson", "Team Weights");
  const conferenceWeights = parseJsonObject("conferenceWeightsJson", "Conference Weights");

  const columns = readNumber("gridColumns", { integer: true, min: 1, fallback: 4 });
  const rows = readNumber("gridRows", { integer: true, min: 1, fallback: 4 });

  return {
    API: {
      REFRESH_INTERVAL_MS: readNumber("refreshIntervalSeconds", {
        integer: true,
        min: 1,
        fallback: 3,
      }) * 1000,
    },
    TICKER: {
      enabled: resolvedConfig.TICKER.enabled,
      cycleIntervalMs: readNumber("tickerCycleSeconds", {
        integer: true,
        min: 1,
        fallback: 4,
      }) * 1000,
    },
    TV_LAYOUT: {
      enabled: resolvedConfig.TV_LAYOUT.enabled,
      autoGridFromMaxVisible: false,
      columns,
      rows,
      maxVisibleGames: columns * rows,
    },
    STATUS_WEIGHTS: {
      LIVE: readNumber("statusLive", { integer: true, fallback: resolvedConfig.STATUS_WEIGHTS.LIVE }),
      UPCOMING: readNumber("statusUpcoming", {
        integer: true,
        fallback: resolvedConfig.STATUS_WEIGHTS.UPCOMING,
      }),
      FINAL: readNumber("statusFinal", {
        integer: true,
        fallback: resolvedConfig.STATUS_WEIGHTS.FINAL,
      }),
      UNKNOWN: resolvedConfig.STATUS_WEIGHTS.UNKNOWN,
    },
    BONUS_WEIGHTS: {
      rankedGame: readNumber("bonusRankedGame", {
        integer: true,
        fallback: resolvedConfig.BONUS_WEIGHTS.rankedGame,
      }),
      bothTeamsRanked: readNumber("bonusBothTeamsRanked", {
        integer: true,
        fallback: resolvedConfig.BONUS_WEIGHTS.bothTeamsRanked,
      }),
      closeGame: readNumber("bonusCloseGame", {
        integer: true,
        fallback: resolvedConfig.BONUS_WEIGHTS.closeGame,
      }),
      closeLateGame: readNumber("bonusCloseLateGame", {
        integer: true,
        fallback: resolvedConfig.BONUS_WEIGHTS.closeLateGame,
      }),
    },
    PENALTY_WEIGHTS: {
      finalGame: readNumber("penaltyFinalGame", {
        integer: true,
        fallback: resolvedConfig.PENALTY_WEIGHTS.finalGame,
      }),
      liveBlowout: readNumber("penaltyLiveBlowout", {
        integer: true,
        fallback: resolvedConfig.PENALTY_WEIGHTS.liveBlowout,
      }),
      liveLowInterest: readNumber("penaltyLiveLowInterest", {
        integer: true,
        fallback: resolvedConfig.PENALTY_WEIGHTS.liveLowInterest,
      }),
    },
    CLOSE_GAME_RULES: {
      closeMargin: readNumber("closeMargin", {
        integer: true,
        min: 0,
        fallback: resolvedConfig.CLOSE_GAME_RULES.closeMargin,
      }),
      latePeriodKeywords: resolvedConfig.CLOSE_GAME_RULES.latePeriodKeywords,
    },
    BLOWOUT_RULES: {
      blowoutMargin: readNumber("blowoutMargin", {
        integer: true,
        min: 0,
        fallback: resolvedConfig.BLOWOUT_RULES.blowoutMargin,
      }),
    },
    UPCOMING_TIPOFF_PROXIMITY: {
      enabled: readChecked("upcomingTipoffProximityEnabled"),
      horizonMinutes: readNumber("upcomingTipoffHorizonMinutes", {
        integer: true,
        min: 1,
        fallback: resolvedConfig.UPCOMING_TIPOFF_PROXIMITY.horizonMinutes,
      }),
      maxBonus: readNumber("upcomingTipoffMaxBonus", {
        integer: true,
        min: 0,
        fallback: resolvedConfig.UPCOMING_TIPOFF_PROXIMITY.maxBonus,
      }),
    },
    FINAL_HOLD: {
      enabled: readChecked("finalHoldEnabled"),
      holdMinutes: readNumber("finalHoldMinutes", {
        integer: true,
        min: 0,
        fallback: resolvedConfig.FINAL_HOLD.holdMinutes,
      }),
      maxBonus: readNumber("finalHoldMaxBonus", {
        integer: true,
        min: 0,
        fallback: resolvedConfig.FINAL_HOLD.maxBonus,
      }),
    },
    PROGRESS_BOOST: {
      enabled: readChecked("progressBoostEnabled"),
      secondHalfBonus: readNumber("progressSecondHalfBonus", {
        integer: true,
        fallback: resolvedConfig.PROGRESS_BOOST.secondHalfBonus,
      }),
      overtimeBonus: readNumber("progressOvertimeBonus", {
        integer: true,
        fallback: resolvedConfig.PROGRESS_BOOST.overtimeBonus,
      }),
      maxClockProgressBonus: readNumber("progressMaxClockBonus", {
        integer: true,
        fallback: resolvedConfig.PROGRESS_BOOST.maxClockProgressBonus,
      }),
      firstHalfMinutes: resolvedConfig.PROGRESS_BOOST.firstHalfMinutes,
      secondHalfMinutes: resolvedConfig.PROGRESS_BOOST.secondHalfMinutes,
      overtimeMinutes: resolvedConfig.PROGRESS_BOOST.overtimeMinutes,
    },
    TEAM_WEIGHTS: teamWeights,
    CONFERENCE_WEIGHTS: conferenceWeights,
  };
}

function setNumber(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = Number.isFinite(Number(value)) ? String(value) : "";
  }
}

function setChecked(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.checked = Boolean(value);
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = String(value ?? "");
  }
}

function readNumber(id, options = {}) {
  const { fallback = 0, integer = false, min = null, max = null } = options;
  const input = document.getElementById(id);
  const rawValue = Number(input?.value);

  let value = Number.isFinite(rawValue) ? rawValue : fallback;

  if (integer) {
    value = Math.round(value);
  }

  if (Number.isFinite(min)) {
    value = Math.max(min, value);
  }

  if (Number.isFinite(max)) {
    value = Math.min(max, value);
  }

  return value;
}

function readChecked(id) {
  const input = document.getElementById(id);
  return Boolean(input?.checked);
}

function parseJsonObject(id, label) {
  const element = document.getElementById(id);
  const rawText = String(element?.value ?? "").trim();

  if (!rawText) {
    return {};
  }

  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
}

function showMessage(message, type = "info") {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.className = `status-message status-message--${type}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      deepMerge(targetValue, sourceValue);
      return;
    }

    target[key] = sourceValue;
  });

  return target;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
