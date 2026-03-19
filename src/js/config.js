// src/js/config.js
// ------------------------------------------------------------
// Main control panel for Sports Command Center.
//
// Edit the USER_SETTINGS block first.
// Most users should never need to touch the advanced/internal section.
// ------------------------------------------------------------

const SETTINGS_SERVER_PORT = 3000;

// ============================================================
// USER_SETTINGS (EDIT HERE)
// ============================================================
const USER_SETTINGS = {
  // Refresh + clock behavior
  refreshIntervalSeconds: 3,
  clockIntervalMs: 1000,
  settingsSyncSeconds: 5,

  // TV layout
  layout: {
    columns: 4,
    rows: 4,
    gapPx: 10,
    outerPaddingPx: 10,
    tickerHeightPx: 46,
    targetCardAspectRatio: 1.4,
    autoGridFromMaxVisible: false,
    enabled: true,
  },

  // Ticker + bottom-row rotator
  ticker: {
    enabled: true,
    cycleIntervalMs: 4500,
  },
  rotatingBottomRow: {
    enabled: false,
    cycleSeconds: 8,
    fadeMs: 450,
  },

  // Display timezone
  display: {
    timeZone: "America/Chicago",
    timeLabel: "CT",
  },

  // Game filtering
  gameFilters: {
    // When true, show only NCAA tournament-style games.
    // Logic uses bracketRound + both team seeds + championship id check.
    marchMadnessOnly: true,
    // Current NCAA tournament championship id (observed from API).
    // Keep as an array so you can add ids later if needed.
    marchMadnessChampionshipIds: [6393],
  },

  // Team branding + logo behavior
  teamBranding: {
    localLogosEnabled: true,
    preferLocalLogos: true,
    localLogoCatalogPath: "/logos/catalog",
    useRealLogos: true,
    logoBaseUrl: "https://ncaa-api.henrygd.me/logo",
    localLogoOverrides: {
      "miami-oh": "Miami (Ohio).svg",
      "miami-fl": "Miami.svg",
      illinois: "Illinois Fighting.svg",
      "illinois-fighting": "Illinois Fighting.svg",
      "illinois-fighting-illini": "Illinois Fighting.svg",
      "eastern-illinois": "Eastern Illinois.svg",
    },
  },

  // ------------------- SCORING CHEAT SHEET -------------------
  // Final score = status + team + conference + boosts - penalties
  // Tune order:
  // 1) statusWeights
  // 2) bonusWeights / penaltyWeights
  // 3) closeGameRules / blowoutRules
  // 4) teamWeights / conferenceWeights
  // 5) tipoffProximity / progressBoost / finalHold
  scoring: {
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
      // Michigan stays strongly preferred, but final games are reduced by finalStatusMultiplier.
      michigan: 2400,
    },

    teamPreferenceRules: {
      // 0 removes preferred-team boost once game is FINAL.
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

    upcomingTipoffProximity: {
      enabled: true,
      horizonMinutes: 360,
      maxBonus: 120,
    },

    progressBoost: {
      enabled: true,
      maxClockProgressBonus: 350,
      overtimeBonus: 120,
    },

    scoringDebug: {
      enabled: false,
      topGamesToLog: 12,
    },
  },

  // March Madness rooting dots
  // Dot appears only when that bracket picked that team for the game's round.
  // No elimination check is applied: if the picked team is on the card for that round, dot shows.
  bracketRooting: {
    enabled: true,
    brackets: [
      {
        id: "gimmie-dat-tschetter",
        name: "Gimmie dat Tschetter",
        color: "#ffd400",
        picksByRound: {
          "round-of-64": [
            "Duke",
            "TCU",
            "UNI",
            "Kansas",
            "South Fla.",
            "Michigan St.",
            "UCLA",
            "UConn",
            "Arizona",
            "Utah St.",
            "Wisconsin",
            "Arkansas",
            "BYU",
            "Gonzaga",
            "Miami (FL)",
            "Purdue",
            "Florida",
            "Iowa",
            "Vanderbilt",
            "Troy",
            "VCU",
            "Illinois",
            "Saint Mary's (CA)",
            "Houston",
            "Michigan",
            "Saint Louis",
            "Texas Tech",
            "Hofstra",
            "Miami (OH)",
            "Virginia",
            "Santa Clara",
            "Iowa St.",
          ],
          "round-of-32": [
            "Duke",
            "Kansas",
            "South Fla.",
            "UConn",
            "Arizona",
            "Arkansas",
            "Gonzaga",
            "Purdue",
            "Florida",
            "Vanderbilt",
            "Illinois",
            "Houston",
            "Michigan",
            "Texas Tech",
            "Virginia",
            "Iowa St.",
          ],
          "sweet-16": [
            "Duke",
            "UConn",
            "Arizona",
            "Gonzaga",
            "Vanderbilt",
            "Houston",
            "Michigan",
            "Virginia",
          ],
          "elite-8": ["Duke", "Arizona", "Houston", "Michigan"],
          "final-four": ["Duke", "Michigan"],
          championship: ["Michigan"],
        },
      },
      {
        id: "ozzy-bracket",
        name: "Ozzy Bracket",
        color: "#30d158",
        picksByRound: {
          "round-of-64": [
            "Duke",
            "Ohio St.",
            "St. John's (NY)",
            "California Baptist",
            "Louisville",
            "North Dakota St.",
            "UCLA",
            "UConn",
            "Arizona",
            "Villanova",
            "Wisconsin",
            "Hawaii",
            "Texas",
            "Gonzaga",
            "Missouri",
            "Purdue",
            "Florida",
            "Iowa",
            "McNeese",
            "Nebraska",
            "North Carolina",
            "Penn",
            "Saint Mary's (CA)",
            "Houston",
            "Michigan",
            "Georgia",
            "Texas Tech",
            "Hofstra",
            "Tennessee",
            "Virginia",
            "Santa Clara",
            "Iowa St.",
          ],
          "round-of-32": [
            "Ohio St.",
            "St. John's (NY)",
            "Louisville",
            "UCLA",
            "Arizona",
            "Wisconsin",
            "Gonzaga",
            "Purdue",
            "Florida",
            "Nebraska",
            "Penn",
            "Houston",
            "Georgia",
            "Hofstra",
            "Tennessee",
            "Iowa St.",
          ],
          "sweet-16": [
            "St. John's (NY)",
            "Louisville",
            "Arizona",
            "Purdue",
            "Florida",
            "Houston",
            "Georgia",
            "Tennessee",
          ],
          "elite-8": ["Louisville", "Arizona", "Florida", "Tennessee"],
          "final-four": ["Florida", "Tennessee"],
          championship: ["Florida"],
        },
      },
      {
        id: "melina-bracket",
        name: "Melina Bracket",
        color: "#ff6b6b",
        picksByRound: {
          "round-of-64": [
            "Duke",
            "Ohio St.",
            "St. John's (NY)",
            "Kansas",
            "Louisville",
            "Michigan St.",
            "UCLA",
            "UConn",
            "Arizona",
            "Utah St.",
            "Wisconsin",
            "Arkansas",
            "BYU",
            "Gonzaga",
            "Miami (FL)",
            "Purdue",
            "Florida",
            "Iowa",
            "Vanderbilt",
            "Nebraska",
            "North Carolina",
            "Illinois",
            "Texas A&M",
            "Houston",
            "Michigan",
            "Georgia",
            "Texas Tech",
            "Alabama",
            "Tennessee",
            "Virginia",
            "Kentucky",
            "Iowa St.",
          ],
          "round-of-32": [
            "Duke",
            "Kansas",
            "Michigan St.",
            "UCLA",
            "Arizona",
            "Wisconsin",
            "Gonzaga",
            "Purdue",
            "Florida",
            "Nebraska",
            "Illinois",
            "Houston",
            "Michigan",
            "Alabama",
            "Virginia",
            "Iowa St.",
          ],
          "sweet-16": [
            "Duke",
            "Michigan St.",
            "Arizona",
            "Gonzaga",
            "Florida",
            "Illinois",
            "Michigan",
            "Virginia",
          ],
          "elite-8": ["Duke", "Arizona", "Illinois", "Michigan"],
          "final-four": ["Duke", "Michigan"],
          championship: ["Michigan"],
        },
      },
      {
        id: "overthinking-it-bracket",
        name: "Overthinking It Bracket",
        color: "#66b3ff",
        picksByRound: {
          "round-of-64": [
            "Duke",
            "TCU",
            "St. John's (NY)",
            "Kansas",
            "South Fla.",
            "Michigan St.",
            "UCLA",
            "UConn",
            "Arizona",
            "Utah St.",
            "Wisconsin",
            "Arkansas",
            "Texas",
            "Gonzaga",
            "Missouri",
            "Purdue",
            "Florida",
            "Iowa",
            "Vanderbilt",
            "Nebraska",
            "VCU",
            "Illinois",
            "Texas A&M",
            "Houston",
            "Michigan",
            "Saint Louis",
            "Akron",
            "Hofstra",
            "Tennessee",
            "Virginia",
            "Santa Clara",
            "Iowa St.",
          ],
          "round-of-32": [
            "Duke",
            "St. John's (NY)",
            "Michigan St.",
            "UCLA",
            "Arizona",
            "Wisconsin",
            "Gonzaga",
            "Missouri",
            "Florida",
            "Vanderbilt",
            "Illinois",
            "Houston",
            "Michigan",
            "Hofstra",
            "Virginia",
            "Iowa St.",
          ],
          "sweet-16": [
            "Duke",
            "Michigan St.",
            "Arizona",
            "Gonzaga",
            "Florida",
            "Houston",
            "Michigan",
            "Iowa St.",
          ],
          "elite-8": ["Duke", "Arizona", "Florida", "Iowa St."],
          "final-four": ["Duke", "Arizona"],
          championship: ["Arizona"],
        },
      },
    ],
    roundAliases: {
      "first-round": "round-of-64",
      "second-round": "round-of-32",
      "round-of-64": "round-of-64",
      "round-of-32": "round-of-32",
      "sweet-16": "sweet-16",
      "regional-semifinal": "sweet-16",
      "elite-8": "elite-8",
      "regional-final": "elite-8",
      "final-four": "final-four",
      "national-semifinal": "final-four",
      championship: "championship",
      "national-championship": "championship",
      "title-game": "championship",
    },
  },
};

// ============================================================
// ADVANCED_DEFAULTS (RARELY EDIT)
// ============================================================
const ADVANCED_DEFAULTS = {
  api: {
    sport: "basketball-men",
    divisionPath: "d1",
    requestTimeoutMs: 8000,
  },

  conferenceNameMap: {
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

  uiText: {
    loading: "Loading today's games...",
    empty: "No games were found for today.",
    fetchError:
      "We could not load NCAA game data right now. The dashboard will keep trying automatically.",
  },
};

export const CONFIG = {
  API: {
    BASE_URL: buildLocalServerUrl("/api"),
    SPORT: ADVANCED_DEFAULTS.api.sport,
    DIVISION_PATH: ADVANCED_DEFAULTS.api.divisionPath,
    REQUEST_TIMEOUT_MS: ADVANCED_DEFAULTS.api.requestTimeoutMs,
    REFRESH_INTERVAL_MS: USER_SETTINGS.refreshIntervalSeconds * 1000,
  },

  SETTINGS_SYNC: {
    enabled: true,
    pollIntervalMs: USER_SETTINGS.settingsSyncSeconds * 1000,
  },

  CLOCK_INTERVAL_MS: USER_SETTINGS.clockIntervalMs,

  TV_LAYOUT: {
    enabled: USER_SETTINGS.layout.enabled,
    autoGridFromMaxVisible: USER_SETTINGS.layout.autoGridFromMaxVisible,
    gapPx: USER_SETTINGS.layout.gapPx,
    outerPaddingPx: USER_SETTINGS.layout.outerPaddingPx,
    tickerHeightPx: USER_SETTINGS.layout.tickerHeightPx,
    targetCardAspectRatio: USER_SETTINGS.layout.targetCardAspectRatio,
    maxVisibleGames: USER_SETTINGS.layout.columns * USER_SETTINGS.layout.rows,
    columns: USER_SETTINGS.layout.columns,
    rows: USER_SETTINGS.layout.rows,
  },

  TICKER: {
    enabled: USER_SETTINGS.ticker.enabled,
    cycleIntervalMs: USER_SETTINGS.ticker.cycleIntervalMs,
  },

  BOTTOM_ROW_ROTATOR: {
    enabled: USER_SETTINGS.rotatingBottomRow.enabled,
    cycleIntervalMs: USER_SETTINGS.rotatingBottomRow.cycleSeconds * 1000,
    fadeMs: USER_SETTINGS.rotatingBottomRow.fadeMs,
  },

  TEAM_BRANDING: {
    LOCAL_LOGOS_ENABLED: USER_SETTINGS.teamBranding.localLogosEnabled,
    PREFER_LOCAL_LOGOS: USER_SETTINGS.teamBranding.preferLocalLogos,
    LOCAL_LOGO_CATALOG_URL: buildLocalServerUrl(USER_SETTINGS.teamBranding.localLogoCatalogPath),
    LOCAL_LOGO_OVERRIDES: USER_SETTINGS.teamBranding.localLogoOverrides,
    USE_REAL_LOGOS: USER_SETTINGS.teamBranding.useRealLogos,
    LOGO_BASE_URL: USER_SETTINGS.teamBranding.logoBaseUrl,
  },

  STATUS_WEIGHTS: USER_SETTINGS.scoring.statusWeights,
  CONFERENCE_WEIGHTS: USER_SETTINGS.scoring.conferenceWeights,
  TEAM_WEIGHTS: USER_SETTINGS.scoring.teamWeights,
  TEAM_PREFERENCE_RULES: USER_SETTINGS.scoring.teamPreferenceRules,
  BONUS_WEIGHTS: USER_SETTINGS.scoring.bonusWeights,
  PENALTY_WEIGHTS: USER_SETTINGS.scoring.penaltyWeights,
  FINAL_HOLD: USER_SETTINGS.scoring.finalHold,
  CLOSE_GAME_RULES: USER_SETTINGS.scoring.closeGameRules,
  BLOWOUT_RULES: USER_SETTINGS.scoring.blowoutRules,
  UPCOMING_TIPOFF_PROXIMITY: USER_SETTINGS.scoring.upcomingTipoffProximity,
  PROGRESS_BOOST: USER_SETTINGS.scoring.progressBoost,
  SCORING_DEBUG: USER_SETTINGS.scoring.scoringDebug,

  DISPLAY: {
    TIME_ZONE: USER_SETTINGS.display.timeZone,
    TIME_LABEL: USER_SETTINGS.display.timeLabel,
  },

  GAME_FILTERS: {
    marchMadnessOnly: USER_SETTINGS.gameFilters.marchMadnessOnly,
    marchMadnessChampionshipIds: USER_SETTINGS.gameFilters.marchMadnessChampionshipIds,
  },

  BRACKET_ROOTING: USER_SETTINGS.bracketRooting,

  CONFERENCE_NAME_MAP: ADVANCED_DEFAULTS.conferenceNameMap,
  UI_TEXT: ADVANCED_DEFAULTS.uiText,
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

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

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


