// src/js/config.js
// ------------------------------------------------------------
// This file is your main control panel for the app.
// Change values here to tune scoring, refresh speed, and preferences.
// ------------------------------------------------------------

const SETTINGS_SERVER_PORT = 3000;

/**
 * Build a URL that points to the local settings/proxy server.
 * Uses current hostname so this works on Raspberry Pi and LAN devices.
 */
function buildLocalServerUrl(path) {
  const safePath = String(path ?? "").startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") {
    return `http://localhost:${SETTINGS_SERVER_PORT}${safePath}`;
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname || "localhost";
  return `${protocol}//${host}:${SETTINGS_SERVER_PORT}${safePath}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMergeMutable(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      deepMergeMutable(targetValue, sourceValue);
      return;
    }

    target[key] = sourceValue;
  });

  return target;
}

// ============================================================
// QUICK_TUNE (EDIT HERE FIRST)
// ============================================================
// Beginner shortcut:
// Most day-to-day tuning should happen in this block.
//
// ------------------- SCORING CHEAT SHEET --------------------
// Final score is built from:
//   base status score
// + team preference
// + conference preference (higher side only)
// + game situation boosts
// - game situation penalties
//
// 1) STATUS_WEIGHTS (biggest driver)
// - LIVE: baseline for all live games.
// - UPCOMING: baseline for pre-tip games.
// - FINAL: baseline for finished games.
// If ordering feels wrong globally, tune this first.
//
// 2) TEAM_WEIGHTS + TEAM_PREFERENCE_RULES
// - TEAM_WEIGHTS boosts your preferred teams.
// - finalStatusMultiplier controls how much that boost remains once a game is FINAL.
//   Example: 0 means preferred-team boost is removed after final.
//
// 3) CONFERENCE_WEIGHTS
// - Adds a conference preference bonus.
// - Uses only the higher conference weight from the two teams (not both added).
//
// 4) BONUS_WEIGHTS
// - rankedGame: one ranked team.
// - bothTeamsRanked: both ranked.
// - closeGame: live margin <= closeMargin (scaled by firstHalfCloseMultiplier in 1st half).
// - closeLateGame: live margin <= closeLateMargin AND clock <= closeLateMinutesLeft
//   in 2nd half/OT.
//
// 5) PENALTY_WEIGHTS
// - finalGame: final games are pushed down (except during final-hold window).
// - liveBlowout: large-margin live games.
// - liveLowInterest: live games with no ranked/close/preferred signals.
//
// 6) TIMING BOOSTS
// - upcomingTipoffProximity: gradual boost as tipoff gets closer.
// - progressBoost: clock-based live boost (later game clock state = higher score).
//
// 7) FINAL_HOLD
// - Keeps newly final games visible briefly, then fades the boost out.
//
// Quick tune order:
// 1) statusWeights  2) bonusWeights/penaltyWeights  3) closeGameRules
// 4) teamWeights/conferenceWeights  5) tipoff/progress/finalHold
// ============================================================
const QUICK_TUNE = {
  refreshIntervalSeconds: 3,
  clockIntervalMs: 1000,

  // Automatically pull saved settings from /settings/config.
  // This removes the need for manual browser refresh after saving settings.
  settingsSyncSeconds: 5,

  // TV layout sizing control:
  // Change these values to control BOTH:
  // 1) number of cards shown
  // 2) card size
  gridColumns: 4,
  gridRows: 4,

  statusWeights: {
    LIVE: 1700,
    UPCOMING: 650,
    FINAL: 40,
    UNKNOWN: 0,
  },

  conferenceWeights: {
    "big-ten": 50,
    sec: 50,
    acc: 50,
    "big-12": 50,
    "big-east": 50,
  },

  teamWeights: {
    // Michigan stays strongly preferred, but final games are reduced by status multiplier below.
    michigan: 2400,
  },

  // Prevent preferred-team bonus from overpowering live/upcoming games once a game is FINAL.
  teamPreferenceRules: {
    finalStatusMultiplier: 0,
  },

  bonusWeights: {
    rankedGame: 240,
    bothTeamsRanked: 320,
    closeGame: 170,
    closeLateGame: 520,
  },

  penaltyWeights: {
    finalGame: 200,
    liveBlowout: 260,
    liveLowInterest: 180,
  },

  // Keep newly final games on-screen for a short window, then let them drop.
  finalHold: {
    enabled: true,
    holdMinutes: 3,
    maxBonus: 950,
  },

  closeGameRules: {
    closeMargin: 8,
    firstHalfCloseMultiplier: 0.15,
    closeLateMargin: 8,
    closeLateMinutesLeft: 5,
  },

  blowoutRules: {
    blowoutMargin: 20,
  },

  // Gradual upcoming-game bonus: closer tipoff => higher score.
  // This replaces custom sorting overrides with a visible score component.
  upcomingTipoffProximity: {
    enabled: true,
    horizonMinutes: 360,
    maxBonus: 120,
  },

  progressBoost: {
    enabled: true,
    // Clock-based progress bonus from game start to end of regulation.
    maxClockProgressBonus: 350,
    // Optional extra boost for overtime games.
    overtimeBonus: 120,
  },

  // Optional mode: replace bottom ticker with rotating final row of cards.
  rotatingBottomRow: {
    enabled: false,
    cycleSeconds: 8,
    fadeMs: 450,
  },
};

function createWeightPreset(id, label, description, overrides) {
  return {
    id,
    label,
    description,
    overrides,
  };
}

/**
 * Weight presets for fast tuning profiles from the Settings page.
 * - "custom-current" preserves your current hand-tuned setup.
 * - Other presets provide different viewing styles.
 */
export const WEIGHT_PRESETS = [
  createWeightPreset(
    "custom-current",
    "My Custom (Current)",
    "Your current tuned weights with Michigan preference and balanced live/ranked/close behavior.",
    {
      STATUS_WEIGHTS: {
        LIVE: QUICK_TUNE.statusWeights.LIVE,
        UPCOMING: QUICK_TUNE.statusWeights.UPCOMING,
        FINAL: QUICK_TUNE.statusWeights.FINAL,
      },
      BONUS_WEIGHTS: {
        rankedGame: QUICK_TUNE.bonusWeights.rankedGame,
        bothTeamsRanked: QUICK_TUNE.bonusWeights.bothTeamsRanked,
        closeGame: QUICK_TUNE.bonusWeights.closeGame,
        closeLateGame: QUICK_TUNE.bonusWeights.closeLateGame,
      },
      PENALTY_WEIGHTS: {
        finalGame: QUICK_TUNE.penaltyWeights.finalGame,
        liveBlowout: QUICK_TUNE.penaltyWeights.liveBlowout,
        liveLowInterest: QUICK_TUNE.penaltyWeights.liveLowInterest,
      },
      TEAM_WEIGHTS: { ...QUICK_TUNE.teamWeights },
      CONFERENCE_WEIGHTS: { ...QUICK_TUNE.conferenceWeights },
      CLOSE_GAME_RULES: {
        closeMargin: QUICK_TUNE.closeGameRules.closeMargin,
        firstHalfCloseMultiplier: QUICK_TUNE.closeGameRules.firstHalfCloseMultiplier,
        closeLateMargin: QUICK_TUNE.closeGameRules.closeLateMargin,
        closeLateMinutesLeft: QUICK_TUNE.closeGameRules.closeLateMinutesLeft,
      },
      BLOWOUT_RULES: {
        blowoutMargin: QUICK_TUNE.blowoutRules.blowoutMargin,
      },
      UPCOMING_TIPOFF_PROXIMITY: {
        enabled: QUICK_TUNE.upcomingTipoffProximity.enabled,
        horizonMinutes: QUICK_TUNE.upcomingTipoffProximity.horizonMinutes,
        maxBonus: QUICK_TUNE.upcomingTipoffProximity.maxBonus,
      },
      PROGRESS_BOOST: {
        enabled: QUICK_TUNE.progressBoost.enabled,
        maxClockProgressBonus: QUICK_TUNE.progressBoost.maxClockProgressBonus,
        overtimeBonus: QUICK_TUNE.progressBoost.overtimeBonus,
      },
      FINAL_HOLD: {
        enabled: QUICK_TUNE.finalHold.enabled,
        holdMinutes: QUICK_TUNE.finalHold.holdMinutes,
        maxBonus: QUICK_TUNE.finalHold.maxBonus,
      },
    }
  ),
  createWeightPreset(
    "balanced-national",
    "Balanced National",
    "Good all-around profile: live games lead, ranked matchups matter, and conference bias is minimal.",
    {
      STATUS_WEIGHTS: {
        LIVE: 1650,
        UPCOMING: 620,
        FINAL: 40,
      },
      BONUS_WEIGHTS: {
        rankedGame: 300,
        bothTeamsRanked: 380,
        closeGame: 140,
        closeLateGame: 420,
      },
      PENALTY_WEIGHTS: {
        finalGame: 260,
        liveBlowout: 240,
        liveLowInterest: 220,
      },
      TEAM_WEIGHTS: {
        michigan: 1800,
      },
      CONFERENCE_WEIGHTS: {
        "big-ten": 45,
        sec: 45,
        acc: 45,
        "big-12": 45,
        "big-east": 45,
      },
      CLOSE_GAME_RULES: {
        closeMargin: 8,
        firstHalfCloseMultiplier: 0.3,
        closeLateMargin: 6,
        closeLateMinutesLeft: 8,
      },
      BLOWOUT_RULES: {
        blowoutMargin: 20,
      },
      UPCOMING_TIPOFF_PROXIMITY: {
        enabled: true,
        horizonMinutes: 300,
        maxBonus: 120,
      },
      PROGRESS_BOOST: {
        enabled: true,
        maxClockProgressBonus: 180,
        overtimeBonus: 140,
      },
      FINAL_HOLD: {
        enabled: true,
        holdMinutes: 3,
        maxBonus: 900,
      },
    }
  ),
  createWeightPreset(
    "live-chaos",
    "Live Game Heavy",
    "Prioritizes what is happening now. Upcoming games almost never jump over active live games.",
    {
      STATUS_WEIGHTS: {
        LIVE: 1900,
        UPCOMING: 420,
        FINAL: 30,
      },
      BONUS_WEIGHTS: {
        rankedGame: 220,
        bothTeamsRanked: 300,
        closeGame: 120,
        closeLateGame: 360,
      },
      PENALTY_WEIGHTS: {
        finalGame: 300,
        liveBlowout: 260,
        liveLowInterest: 240,
      },
      TEAM_WEIGHTS: {
        michigan: 1700,
      },
      CONFERENCE_WEIGHTS: {
        "big-ten": 40,
        sec: 40,
        acc: 40,
        "big-12": 40,
        "big-east": 40,
      },
      CLOSE_GAME_RULES: {
        closeMargin: 7,
        firstHalfCloseMultiplier: 0.2,
        closeLateMargin: 5,
        closeLateMinutesLeft: 7,
      },
      BLOWOUT_RULES: {
        blowoutMargin: 18,
      },
      UPCOMING_TIPOFF_PROXIMITY: {
        enabled: true,
        horizonMinutes: 180,
        maxBonus: 80,
      },
      PROGRESS_BOOST: {
        enabled: true,
        maxClockProgressBonus: 240,
        overtimeBonus: 180,
      },
      FINAL_HOLD: {
        enabled: true,
        holdMinutes: 2,
        maxBonus: 700,
      },
    }
  ),
  createWeightPreset(
    "ranked-marquee",
    "Ranked Matchups",
    "Boosts ranked games heavily, useful when you care most about top-25 and high-profile games.",
    {
      STATUS_WEIGHTS: {
        LIVE: 1680,
        UPCOMING: 720,
        FINAL: 40,
      },
      BONUS_WEIGHTS: {
        rankedGame: 520,
        bothTeamsRanked: 700,
        closeGame: 110,
        closeLateGame: 360,
      },
      PENALTY_WEIGHTS: {
        finalGame: 240,
        liveBlowout: 220,
        liveLowInterest: 260,
      },
      TEAM_WEIGHTS: {
        michigan: 1900,
      },
      CONFERENCE_WEIGHTS: {
        "big-ten": 35,
        sec: 35,
        acc: 35,
        "big-12": 35,
        "big-east": 35,
      },
      CLOSE_GAME_RULES: {
        closeMargin: 8,
        firstHalfCloseMultiplier: 0.25,
        closeLateMargin: 5,
        closeLateMinutesLeft: 8,
      },
      BLOWOUT_RULES: {
        blowoutMargin: 22,
      },
      UPCOMING_TIPOFF_PROXIMITY: {
        enabled: true,
        horizonMinutes: 420,
        maxBonus: 160,
      },
      PROGRESS_BOOST: {
        enabled: true,
        maxClockProgressBonus: 150,
        overtimeBonus: 120,
      },
      FINAL_HOLD: {
        enabled: true,
        holdMinutes: 3,
        maxBonus: 850,
      },
    }
  ),
  createWeightPreset(
    "close-game-drama",
    "Close Late Drama",
    "Designed for nail-biters: tight late games rise quickly, especially near the end of regulation.",
    {
      STATUS_WEIGHTS: {
        LIVE: 1720,
        UPCOMING: 560,
        FINAL: 35,
      },
      BONUS_WEIGHTS: {
        rankedGame: 220,
        bothTeamsRanked: 280,
        closeGame: 210,
        closeLateGame: 760,
      },
      PENALTY_WEIGHTS: {
        finalGame: 260,
        liveBlowout: 300,
        liveLowInterest: 230,
      },
      TEAM_WEIGHTS: {
        michigan: 1700,
      },
      CONFERENCE_WEIGHTS: {
        "big-ten": 40,
        sec: 40,
        acc: 40,
        "big-12": 40,
        "big-east": 40,
      },
      CLOSE_GAME_RULES: {
        closeMargin: 8,
        firstHalfCloseMultiplier: 0.2,
        closeLateMargin: 6,
        closeLateMinutesLeft: 10,
      },
      BLOWOUT_RULES: {
        blowoutMargin: 18,
      },
      UPCOMING_TIPOFF_PROXIMITY: {
        enabled: true,
        horizonMinutes: 240,
        maxBonus: 100,
      },
      PROGRESS_BOOST: {
        enabled: true,
        maxClockProgressBonus: 220,
        overtimeBonus: 170,
      },
      FINAL_HOLD: {
        enabled: true,
        holdMinutes: 3,
        maxBonus: 1000,
      },
    }
  ),
];

export const CONFIG = {
  API: {
    // Use local proxy to avoid browser CORS blocks.
    // Run server/server.js so this URL is available.
    BASE_URL: buildLocalServerUrl("/api"),
    SPORT: "basketball-men",
    DIVISION_PATH: "d1",
    REQUEST_TIMEOUT_MS: 8000,
    REFRESH_INTERVAL_MS: QUICK_TUNE.refreshIntervalSeconds * 1000,
  },

  SETTINGS_SYNC: {
    enabled: true,
    pollIntervalMs: QUICK_TUNE.settingsSyncSeconds * 1000,
  },

  CLOCK_INTERVAL_MS: QUICK_TUNE.clockIntervalMs,

  // TV-first layout settings (55" 1080p target).
  // In this mode, rows/columns are the source of truth.
  // maxVisibleGames is derived automatically from rows * columns.
  TV_LAYOUT: {
    enabled: true,
    autoGridFromMaxVisible: false,
    gapPx: 10,
    outerPaddingPx: 10,
    tickerHeightPx: 46,
    targetCardAspectRatio: 1.4,
    maxVisibleGames: QUICK_TUNE.gridColumns * QUICK_TUNE.gridRows,
    // Used only when autoGridFromMaxVisible is false.
    columns: QUICK_TUNE.gridColumns,
    rows: QUICK_TUNE.gridRows,
  },

  // ESPN-style bottom ticker behavior.
  TICKER: {
    enabled: true,
    cycleIntervalMs: 4500,
  },

  // If enabled, this mode hides ticker and rotates games through the bottom row.
  BOTTOM_ROW_ROTATOR: {
    enabled: QUICK_TUNE.rotatingBottomRow.enabled,
    cycleIntervalMs: QUICK_TUNE.rotatingBottomRow.cycleSeconds * 1000,
    fadeMs: QUICK_TUNE.rotatingBottomRow.fadeMs,
  },

  // Team logo options.
  TEAM_BRANDING: {
    // Local logos from assets/logos are fastest and most reliable for Pi setups.
    LOCAL_LOGOS_ENABLED: true,
    PREFER_LOCAL_LOGOS: true,
    LOCAL_LOGO_CATALOG_URL: buildLocalServerUrl("/logos/catalog"),
    // Optional manual fixes for teams with ambiguous names.
    // Key format: normalized team seo/name (lowercase, letters+numbers+hyphen).
    // Value format: local logo filename (for example "Miami (Ohio).svg").
    LOCAL_LOGO_OVERRIDES: {
      "miami-oh": "Miami (Ohio).svg",
      "miami-fl": "Miami.svg",
      illinois: "Illinois Fighting.svg",
      "illinois-fighting": "Illinois Fighting.svg",
      "illinois-fighting-illini": "Illinois Fighting.svg",
      "eastern-illinois": "Eastern Illinois.svg",
    },

    // Remote NCAA logos remain as fallback for any team not found locally.
    USE_REAL_LOGOS: true,
    LOGO_BASE_URL: "https://ncaa-api.henrygd.me/logo",
  },

  // Base weight by game status (higher means more important)
  STATUS_WEIGHTS: QUICK_TUNE.statusWeights,

  // Conference preference weights
  // Keys should use lowercase slugs like "big-ten" and "sec".
  CONFERENCE_WEIGHTS: QUICK_TUNE.conferenceWeights,

  // Team preference weights
  // Keys use normalized team names (lowercase).
  TEAM_WEIGHTS: QUICK_TUNE.teamWeights,

  TEAM_PREFERENCE_RULES: QUICK_TUNE.teamPreferenceRules,

  // Bonus weights for game situations
  BONUS_WEIGHTS: QUICK_TUNE.bonusWeights,

  // Penalties for less-watchable situations.
  PENALTY_WEIGHTS: QUICK_TUNE.penaltyWeights,

  // Temporary boost for newly final games so they do not disappear immediately.
  FINAL_HOLD: QUICK_TUNE.finalHold,

  CLOSE_GAME_RULES: QUICK_TUNE.closeGameRules,

  BLOWOUT_RULES: QUICK_TUNE.blowoutRules,

  UPCOMING_TIPOFF_PROXIMITY: QUICK_TUNE.upcomingTipoffProximity,

  DISPLAY: {
    TIME_ZONE: "America/Chicago",
    TIME_LABEL: "CT",
  },

  // Controls how much extra importance to give LIVE games as they progress.
  // This helps later games float above earlier games when other factors are similar.
  PROGRESS_BOOST: QUICK_TUNE.progressBoost,

  // Optional console logging to help tune weights.
  // Set enabled: true, then open browser DevTools console.
  SCORING_DEBUG: {
    enabled: false,
    topGamesToLog: 12,
  },

  // Used when the API only gives conference SEO slugs.
  CONFERENCE_NAME_MAP: {
    acc: "ACC",
    american: "American",
    "atlantic-10": "Atlantic 10",
    "big-12": "Big 12",
    "big-east": "Big East",
    "big-ten": "Big Ten",
    "big-west": "Big West",
    cusa: "Conference USA",
    mac: "MAC",
    meac: "MEAC",
    "mountain-west": "Mountain West",
    sec: "SEC",
    swac: "SWAC",
    wac: "WAC",
  },

  UI_TEXT: {
    loading: "Loading today's games...",
    empty: "No games were found for today.",
    fetchError:
      "We could not load NCAA game data right now. The dashboard will keep trying automatically.",
  },
};

/**
 * Expose settings server base URL for pages like /settings.
 */
export function getSettingsServerBaseUrl() {
  return buildLocalServerUrl("/settings");
}

export function getLocalServerBaseUrl() {
  return buildLocalServerUrl("");
}

let lastOverridesSignature = null;

/**
 * Apply an override object into live CONFIG.
 * This mutates CONFIG in place so existing imports see updated values.
 */
export function applyConfigOverrides(overrides) {
  if (!isPlainObject(overrides)) {
    return;
  }

  deepMergeMutable(CONFIG, overrides);

  // Keep manual TV layout consistent after overrides.
  const tvLayout = CONFIG.TV_LAYOUT;
  if (tvLayout && tvLayout.autoGridFromMaxVisible === false) {
    const columns = Number(tvLayout.columns);
    const rows = Number(tvLayout.rows);

    if (Number.isInteger(columns) && columns > 0 && Number.isInteger(rows) && rows > 0) {
      tvLayout.maxVisibleGames = columns * rows;
    }
  }
}

/**
 * Load persisted config overrides from local settings server.
 * Safe to call during startup; failures are logged but non-fatal.
 */
export async function loadConfigOverridesFromServer() {
  const url = `${getSettingsServerBaseUrl()}/config`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Settings fetch failed: ${response.status}`);
    }

    const payload = await response.json();
    const overrides = isPlainObject(payload?.overrides) ? payload.overrides : {};
    const nextSignature = JSON.stringify(overrides);
    const hasChanged = nextSignature !== lastOverridesSignature;

    if (!hasChanged) {
      return false;
    }

    applyConfigOverrides(overrides);
    lastOverridesSignature = nextSignature;
    return true;
  } catch (error) {
    // App should still run with defaults if settings endpoint is unavailable.
    console.warn("Using default config (settings override unavailable):", error.message);
    return false;
  }
}
