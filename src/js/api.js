// src/js/api.js
// ------------------------------------------------------------
// Handles all NCAA API communication and data normalization.
// The rest of the app should only use normalized game objects.
// ------------------------------------------------------------

import { CONFIG } from "./config.js";
import { buildNcaaLogoUrl, safeText, toNumber, toSlug } from "./utils.js";

/**
 * Fetch today's Division I men's basketball games.
 */
export async function fetchTodaysGames() {
  // Example resolved URL:
  // http://localhost:3000/api/scoreboard/basketball-men/d1
  const endpoint = `${CONFIG.API.BASE_URL}/scoreboard/${CONFIG.API.SPORT}/${CONFIG.API.DIVISION_PATH}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, CONFIG.API.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const rawData = await response.json();
    return normalizeScoreboardResponse(rawData);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The NCAA API request timed out.");
    }

    throw new Error(error.message || "Unknown API error.");
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Normalize the full API response into an array of clean game objects.
 */
function normalizeScoreboardResponse(rawData) {
  const rawGames = Array.isArray(rawData?.games) ? rawData.games : [];

  return rawGames
    .map((rawGameWrapper) => normalizeGame(rawGameWrapper?.game ?? rawGameWrapper))
    .filter(Boolean);
}

/**
 * Normalize one game object so other files do not depend on raw API shape.
 */
function normalizeGame(rawGame) {
  if (!rawGame || !rawGame.gameID) {
    return null;
  }

  const status = normalizeStatus(rawGame.gameState);
  const statusDetail =
    safeText(rawGame.finalMessage, null) || safeText(rawGame.currentPeriod, null);

  return {
    id: String(rawGame.gameID),
    status,
    statusDetail,
    clock: status === "LIVE" ? safeText(rawGame.contestClock, null) : null,
    startTime: safeText(rawGame.startTime, null),
    startTimeEpoch: toNumber(rawGame.startTimeEpoch, null),
    network: safeText(rawGame.network, null),
    tournamentRound: safeText(rawGame.bracketRound, null),
    region: safeText(rawGame.bracketRegion, null),
    awayTeam: normalizeTeam(rawGame.away),
    homeTeam: normalizeTeam(rawGame.home),
  };
}

/**
 * Normalize a team object into stable fields used by the UI and scoring.
 */
function normalizeTeam(rawTeam) {
  const names = rawTeam?.names ?? {};
  const logoSlugs = buildLogoSlugCandidates(names);
  const seo = logoSlugs[0] ?? null;
  const logoBaseUrl = CONFIG.TEAM_BRANDING?.LOGO_BASE_URL;
  const useRealLogos = CONFIG.TEAM_BRANDING?.USE_REAL_LOGOS !== false;
  const logoUrls = useRealLogos
    ? logoSlugs.map((slug) => buildNcaaLogoUrl(slug, logoBaseUrl)).filter(Boolean)
    : [];
  const logoUrl = logoUrls[0] ?? null;

  return {
    name: safeText(names.short, null) || safeText(names.full, "Unknown Team"),
    shortName: safeText(names.char6, null) || safeText(names.short, "TEAM"),
    seo,
    logoUrl,
    logoUrls,
    rank: parseRank(rawTeam?.rank),
    conference: normalizeConference(rawTeam?.conferences),
    score: parseScore(rawTeam?.score),
    record: safeText(rawTeam?.description, null),
  };
}

function buildLogoSlugCandidates(names) {
  const candidates = [];

  const addCandidate = (value) => {
    const slug = toSlug(value);

    if (!slug) {
      return;
    }

    if (!candidates.includes(slug)) {
      candidates.push(slug);
    }
  };

  const shortName = safeText(names?.short, null);
  const fullName = safeText(names?.full, null);
  const seo = safeText(names?.seo, null);

  addCandidate(seo);
  addCandidate(shortName);
  addCandidate(fullName);

  // Extra fallbacks for names with state abbreviations in parentheses.
  if (shortName) {
    addCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
    addCandidate(shortName.replace(/[.'&]/g, " "));
  }

  if (fullName) {
    addCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
    addCandidate(fullName.replace(/[.'&]/g, " "));
  }

  return candidates;
}

/**
 * Convert raw status values to consistent labels for the app.
 */
function normalizeStatus(rawState) {
  const state = safeText(rawState, "").toLowerCase();

  if (state === "live") {
    return "LIVE";
  }

  if (state === "pre") {
    return "UPCOMING";
  }

  if (state === "final") {
    return "FINAL";
  }

  return "UNKNOWN";
}

/**
 * Parse ranking string into a number, or null when missing.
 */
function parseRank(rawRank) {
  const rank = toNumber(rawRank, null);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

/**
 * Parse score string into a number, or null when missing.
 */
function parseScore(rawScore) {
  const score = toNumber(rawScore, null);
  return Number.isInteger(score) ? score : null;
}

/**
 * Normalize conference from API conference objects.
 */
function normalizeConference(conferences) {
  if (!Array.isArray(conferences) || conferences.length === 0) {
    return null;
  }

  const firstConference = conferences[0] ?? {};
  const conferenceName = safeText(firstConference.conferenceName, null);
  const conferenceSeo = safeText(firstConference.conferenceSeo, null);

  if (conferenceName) {
    return conferenceName;
  }

  if (conferenceSeo) {
    return CONFIG.CONFERENCE_NAME_MAP[conferenceSeo] ?? conferenceSeo;
  }

  return null;
}
