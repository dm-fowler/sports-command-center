// src/js/api.js
// ------------------------------------------------------------
// Handles all NCAA API communication and data normalization.
// The rest of the app should only use normalized game objects.
// ------------------------------------------------------------

import { CONFIG, getLocalServerBaseUrl } from "./config.js";
import { buildNcaaLogoUrl, safeText, toNumber, toSlug } from "./utils.js";

const LOCAL_LOGO_MATCH_LIMIT = 4;
const LOCAL_LOGO_MIN_SCORE = 38;

let localLogoCatalogCache = null;
let localLogoCatalogPromise = null;
const localLogoLookupCache = new Map();

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
    const localLogoCatalog = await loadLocalLogoCatalog();
    return normalizeScoreboardResponse(rawData, localLogoCatalog);
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
function normalizeScoreboardResponse(rawData, localLogoCatalog) {
  const rawGames = Array.isArray(rawData?.games) ? rawData.games : [];

  return rawGames
    .map((rawGameWrapper) =>
      normalizeGame(rawGameWrapper?.game ?? rawGameWrapper, localLogoCatalog)
    )
    .filter(Boolean);
}

/**
 * Normalize one game object so other files do not depend on raw API shape.
 */
function normalizeGame(rawGame, localLogoCatalog) {
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
    awayTeam: normalizeTeam(rawGame.away, localLogoCatalog),
    homeTeam: normalizeTeam(rawGame.home, localLogoCatalog),
  };
}

/**
 * Normalize a team object into stable fields used by the UI and scoring.
 */
function normalizeTeam(rawTeam, localLogoCatalog) {
  const names = rawTeam?.names ?? {};
  const logoSlugs = buildLogoSlugCandidates(names);
  const seo = logoSlugs[0] ?? null;
  const branding = CONFIG.TEAM_BRANDING ?? {};
  const logoBaseUrl = branding.LOGO_BASE_URL;
  const useRealLogos = branding.USE_REAL_LOGOS !== false;
  const useLocalLogos = branding.LOCAL_LOGOS_ENABLED !== false;
  const preferLocalLogos = branding.PREFER_LOCAL_LOGOS !== false;

  const remoteLogoUrls = useRealLogos
    ? logoSlugs.map((slug) => buildNcaaLogoUrl(slug, logoBaseUrl)).filter(Boolean)
    : [];
  const localLogoOverrideUrl = useLocalLogos
    ? resolveLocalLogoOverrideUrl(names, localLogoCatalog)
    : null;
  const matchedLocalLogoUrls = useLocalLogos
    ? resolveLocalLogoUrls(names, localLogoCatalog)
    : [];
  const localLogoUrls = mergeUniqueUrls(
    localLogoOverrideUrl ? [localLogoOverrideUrl] : [],
    matchedLocalLogoUrls
  );
  const logoUrls = preferLocalLogos
    ? mergeUniqueUrls(localLogoUrls, remoteLogoUrls)
    : mergeUniqueUrls(remoteLogoUrls, localLogoUrls);
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

async function loadLocalLogoCatalog() {
  const branding = CONFIG.TEAM_BRANDING ?? {};
  const useLocalLogos = branding.LOCAL_LOGOS_ENABLED !== false;

  if (!useLocalLogos) {
    return [];
  }

  if (Array.isArray(localLogoCatalogCache)) {
    return localLogoCatalogCache;
  }

  if (localLogoCatalogPromise) {
    return localLogoCatalogPromise;
  }

  const baseUrl = getLocalServerBaseUrl().replace(/\/$/, "");
  const catalogUrl = safeText(branding.LOCAL_LOGO_CATALOG_URL, null) || `${baseUrl}/logos/catalog`;

  localLogoCatalogPromise = fetch(catalogUrl, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Logo catalog request failed (${response.status})`);
      }

      const payload = await response.json();
      const logoEntries = Array.isArray(payload?.logos) ? payload.logos : [];

      localLogoCatalogCache = logoEntries
        .map((entry) => {
          const url = safeText(entry?.url, null);
          const words = normalizeLogoWords(entry?.words ?? entry?.baseName);

          if (!url || !words) {
            return null;
          }

          return {
            url,
            words,
            compact: words.replace(/\s+/g, ""),
            tokens: words.split(" ").filter(Boolean),
          };
        })
        .filter(Boolean);

      // Catalog changed, reset team match cache.
      localLogoLookupCache.clear();
      return localLogoCatalogCache;
    })
    .catch((error) => {
      console.warn("Local logo catalog unavailable. Using remote logo fallback.", error.message);
      localLogoCatalogCache = [];
      return localLogoCatalogCache;
    })
    .finally(() => {
      localLogoCatalogPromise = null;
    });

  return localLogoCatalogPromise;
}

function resolveLocalLogoUrls(names, localLogoCatalog) {
  if (!Array.isArray(localLogoCatalog) || localLogoCatalog.length === 0) {
    return [];
  }

  const candidates = buildLocalLogoNameCandidates(names);

  if (candidates.length === 0) {
    return [];
  }

  const cacheKey = candidates.map((candidate) => candidate.compact).join("|");

  if (localLogoLookupCache.has(cacheKey)) {
    return localLogoLookupCache.get(cacheKey);
  }

  const scoredLogos = localLogoCatalog
    .map((logoEntry) => {
      const bestScore = candidates.reduce((highest, candidate) => {
        return Math.max(highest, scoreLocalLogoMatch(candidate, logoEntry));
      }, 0);

      return {
        score: bestScore,
        url: logoEntry.url,
      };
    })
    .filter((entry) => entry.score >= LOCAL_LOGO_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const matchedUrls = scoredLogos.slice(0, LOCAL_LOGO_MATCH_LIMIT).map((entry) => entry.url);
  localLogoLookupCache.set(cacheKey, matchedUrls);
  return matchedUrls;
}

function resolveLocalLogoOverrideUrl(names, localLogoCatalog) {
  const overrideMap = CONFIG.TEAM_BRANDING?.LOCAL_LOGO_OVERRIDES;

  if (!overrideMap || typeof overrideMap !== "object") {
    return null;
  }

  const keysToCheck = buildLocalLogoNameCandidates(names)
    .map((candidate) => normalizeOverrideKey(candidate.words))
    .filter(Boolean);

  for (const key of keysToCheck) {
    const overrideValue = safeText(overrideMap[key], null);

    if (!overrideValue) {
      continue;
    }

    const overrideUrl = resolveOverrideValueToLogoUrl(overrideValue, localLogoCatalog);

    if (overrideUrl) {
      return overrideUrl;
    }
  }

  return null;
}

function resolveOverrideValueToLogoUrl(overrideValue, localLogoCatalog) {
  const value = String(overrideValue).trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  const normalizedInput = value.toLowerCase();
  const normalizedWithoutExt = normalizedInput.endsWith(".svg")
    ? normalizedInput.slice(0, -4)
    : normalizedInput;

  const match = localLogoCatalog.find((entry) => {
    const fileName = String(entry?.url ?? "")
      .split("/")
      .pop();
    const decodedFileName = decodeURIComponent(fileName || "").toLowerCase();
    const decodedBaseName = decodedFileName.endsWith(".svg")
      ? decodedFileName.slice(0, -4)
      : decodedFileName;

    return decodedFileName === normalizedInput || decodedBaseName === normalizedWithoutExt;
  });

  return match?.url ?? null;
}

function buildLocalLogoNameCandidates(names) {
  const candidates = [];

  const addCandidate = (value) => {
    const words = normalizeLogoWords(value);

    if (!words) {
      return;
    }

    const compact = words.replace(/\s+/g, "");
    const tokens = words
      .split(" ")
      .filter(Boolean)
      .filter((token) => !isLogoStopWord(token));

    if (tokens.length === 0) {
      return;
    }

    if (!candidates.some((candidate) => candidate.compact === compact)) {
      candidates.push({ words, compact, tokens });
    }
  };

  const addStateExpandedCandidate = (value) => {
    const words = normalizeLogoWords(value);

    if (!words) {
      return;
    }

    // Covers common scoreboard abbreviations like "Iowa St." / "Ohio St."
    // by trying a "state" version in addition to the original phrase.
    const expanded = words.replace(/\bst\b/g, "state");
    if (expanded !== words) {
      addCandidate(expanded);
    }
  };

  const shortName = safeText(names?.short, null);
  const fullName = safeText(names?.full, null);
  const seo = safeText(names?.seo, null);
  const char6 = safeText(names?.char6, null);

  addCandidate(seo);
  addCandidate(shortName);
  addCandidate(fullName);
  addCandidate(char6);
  addStateExpandedCandidate(shortName);
  addStateExpandedCandidate(fullName);

  if (shortName) {
    addCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
    addStateExpandedCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
  }

  if (fullName) {
    addCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
    addStateExpandedCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
  }

  return candidates;
}

function scoreLocalLogoMatch(candidate, logoEntry) {
  if (!candidate?.compact || !logoEntry?.compact) {
    return 0;
  }

  if (candidate.compact === logoEntry.compact) {
    return 100;
  }

  if (logoEntry.compact.startsWith(candidate.compact)) {
    const lengthGap = Math.abs(logoEntry.compact.length - candidate.compact.length);

    // Strong prefix match only when candidate is reasonably specific.
    if (candidate.tokens.length >= 2 || lengthGap <= 3) {
      return Math.max(74, 90 - lengthGap);
    }
  }

  if (candidate.words === logoEntry.words) {
    return 96;
  }

  const overlap = getTokenOverlapCount(candidate.tokens, logoEntry.tokens);
  const denominator = Math.max(candidate.tokens.length, logoEntry.tokens.length, 1);
  let score = Math.round((overlap / denominator) * 70);

  // Avoid generic one-token files ("Ohio", "Iowa") winning over specific teams.
  if (logoEntry.tokens.length === 1 && candidate.tokens.length > 1 && overlap === 1) {
    score = Math.min(score, 22);
  }

  if (overlap >= 2) {
    score += 12;
  }

  if (logoEntry.words.includes(candidate.words)) {
    score += 10;
  } else if (candidate.words.includes(logoEntry.words)) {
    score += 8;
  }

  return score;
}

function getTokenOverlapCount(aTokens, bTokens) {
  const setB = new Set(bTokens);
  let overlap = 0;

  aTokens.forEach((token) => {
    if (setB.has(token)) {
      overlap += 1;
    }
  });

  return overlap;
}

function normalizeLogoWords(value) {
  const text = safeText(value, null);

  if (!text) {
    return null;
  }

  return text
    .toLowerCase()
    .replace(/[_'.’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeOverrideKey(value) {
  const words = normalizeLogoWords(value);

  if (!words) {
    return null;
  }

  return words.replace(/\s+/g, "-");
}

function isLogoStopWord(token) {
  return (
    token === "the" ||
    token === "university" ||
    token === "college" ||
    token === "of" ||
    token === "at"
  );
}

function mergeUniqueUrls(...urlLists) {
  const merged = [];

  urlLists.forEach((urlList) => {
    if (!Array.isArray(urlList)) {
      return;
    }

    urlList.forEach((url) => {
      const safeUrl = safeText(url, null);

      if (!safeUrl || merged.includes(safeUrl)) {
        return;
      }

      merged.push(safeUrl);
    });
  });

  return merged;
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
